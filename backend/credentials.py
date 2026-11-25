"""Store model API keys in the current user's system credential store."""

from contextlib import closing, contextmanager
import sqlite3
import ctypes as c
from functools import lru_cache
import os
from pathlib import Path
import sys
import tempfile


TARGET = "PaperTrace/DeepSeek"
ACCOUNT = "DeepSeek"


class WindowsProtectedFile:
    def __init__(self, path):
        from ctypes import wintypes as w

        class Blob(c.Structure):
            _fields_ = [("size", w.DWORD), ("data", c.c_void_p)]

        self.path = path
        self.blob = Blob
        self.api = c.WinDLL("crypt32", use_last_error=True)
        for function in (self.api.CryptProtectData, self.api.CryptUnprotectData):
            function.argtypes = [c.POINTER(Blob), c.c_void_p, c.c_void_p, c.c_void_p,
                                 c.c_void_p, w.DWORD, c.POINTER(Blob)]
            function.restype = w.BOOL
        self.free = c.WinDLL("kernel32").LocalFree
        self.free.argtypes = [c.c_void_p]
        self.free.restype = c.c_void_p

    def transform(self, function, data):
        buffer = c.create_string_buffer(data)
        source = self.blob(len(data), c.addressof(buffer))
        result = self.blob()
        try:
            if not function(c.byref(source), None, None, None, None, 1, c.byref(result)):
                raise c.WinError(c.get_last_error())
            return c.string_at(result.data, result.size)
        finally:
            c.memset(buffer, 0, len(buffer))
            if result.data:
                c.memset(result.data, 0, result.size)
                self.free(result.data)

    def read(self):
        data = self.path.read_bytes()
        return self.transform(self.api.CryptUnprotectData, data).decode("utf-8") if data else None

    def save(self, key):
        # An empty file records removal when the legacy vault cannot be accessed.
        data = self.transform(self.api.CryptProtectData, key.encode("utf-8")) if key else b""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=self.path.parent, delete=False) as pending:
            temporary = Path(pending.name)
            try:
                pending.write(data)
                pending.close()
                temporary.replace(self.path)
            finally:
                pending.close()
                temporary.unlink(missing_ok=True)


class WindowsStore:
    def __init__(self, fallback_path=None, account=ACCOUNT):
        self.target, self.account = "PaperTrace/" + account, account
        from ctypes import wintypes as w

        class Credential(c.Structure):
            _fields_ = [
                ("flags", w.DWORD), ("type", w.DWORD),
                ("target", w.LPWSTR), ("comment", w.LPWSTR),
                ("last_written", w.FILETIME), ("blob_size", w.DWORD),
                ("blob", c.c_void_p), ("persist", w.DWORD),
                ("attribute_count", w.DWORD), ("attributes", c.c_void_p),
                ("target_alias", w.LPWSTR), ("username", w.LPWSTR),
            ]

        self.credential = Credential
        self.fallback_path = fallback_path or Path(os.getenv("LOCALAPPDATA") or
                                                   Path.home() / "AppData" / "Local") / "PaperTrace" / (account.lower() + ".dpapi")
        pointer = c.POINTER(Credential)
        self.api = c.WinDLL("advapi32", use_last_error=True)
        self.api.CredReadW.argtypes = [w.LPCWSTR, w.DWORD, w.DWORD, c.POINTER(pointer)]
        self.api.CredReadW.restype = w.BOOL
        self.api.CredWriteW.argtypes = [pointer, w.DWORD]
        self.api.CredWriteW.restype = w.BOOL
        self.api.CredDeleteW.argtypes = [w.LPCWSTR, w.DWORD, w.DWORD]
        self.api.CredDeleteW.restype = w.BOOL
        self.api.CredFree.argtypes = [c.c_void_p]
        self.api.CredFree.restype = None

    def read(self):
        try:
            return WindowsProtectedFile(self.fallback_path).read()
        except FileNotFoundError:
            return self.read_vault()

    def read_vault(self):
        entry = c.POINTER(self.credential)()
        if not self.api.CredReadW(self.target, 1, 0, c.byref(entry)):  # CRED_TYPE_GENERIC
            if c.get_last_error() in (5, 1168, 1312):  # Access denied, not found, no logon session
                return None
            raise c.WinError(c.get_last_error())
        try:
            blob = entry.contents
            if blob.blob_size:
                return c.string_at(blob.blob, blob.blob_size).decode("utf-16-le").rstrip("\0").strip()
        finally:
            self.api.CredFree(entry)

    def save(self, key):
        if self.fallback_path.exists():
            WindowsProtectedFile(self.fallback_path).save(key)
            return
        data = key.encode("utf-16-le")
        buffer = c.create_string_buffer(data)
        entry = self.credential(type=1, target=self.target, blob_size=len(data), blob=c.addressof(buffer),
                                persist=2, username=self.account)  # CRED_PERSIST_LOCAL_MACHINE
        try:
            if not self.api.CredWriteW(c.byref(entry), 0):
                error = c.get_last_error()
                if error not in (5, 1312):
                    raise c.WinError(error)
                WindowsProtectedFile(self.fallback_path).save(key)
            elif self.read_vault() != key:
                WindowsProtectedFile(self.fallback_path).save(key)
        finally:
            c.memset(buffer, 0, len(data))

    def delete(self):
        if not self.api.CredDeleteW(self.target, 1, 0):
            error = c.get_last_error()
            if error in (5, 1312) and self.fallback_path.exists():
                WindowsProtectedFile(self.fallback_path).save(None)
                return
            if error != 1168:
                raise c.WinError(error)
        self.fallback_path.unlink(missing_ok=True)


class MacStore:
    NOT_FOUND = -25300  # errSecItemNotFound
    DUPLICATE = -25299  # errSecDuplicateItem

    def __init__(self, account=ACCOUNT):
        self.security = c.CDLL("/System/Library/Frameworks/Security.framework/Security")
        self.cf = c.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        ref = c.c_void_p
        ref_out = c.POINTER(ref)
        index = c.c_long
        for api, name, args, result in (
            (self.cf, "CFStringCreateWithCString", [ref, c.c_char_p, c.c_uint32], ref),
            (self.cf, "CFDataCreate", [ref, c.c_char_p, index], ref),
            (self.cf, "CFDataGetLength", [ref], index),
            (self.cf, "CFDataGetBytePtr", [ref], ref),
            (self.cf, "CFDictionaryCreate", [ref, ref_out, ref_out, index, ref, ref], ref),
            (self.cf, "CFRelease", [ref], None),
            (self.security, "SecItemCopyMatching", [ref, ref_out], c.c_int32),
            (self.security, "SecItemAdd", [ref, ref_out], c.c_int32),
            (self.security, "SecItemUpdate", [ref, ref], c.c_int32),
            (self.security, "SecItemDelete", [ref], c.c_int32),
        ):
            function = getattr(api, name)
            function.argtypes = args
            function.restype = result
        self.service = self.cf.CFStringCreateWithCString(None, ("PaperTrace/" + account).encode(), 0x08000100)
        self.account = self.cf.CFStringCreateWithCString(None, account.encode(), 0x08000100)
        self.query = {"kSecClass": self.constant("kSecClassGenericPassword"),
                      "kSecAttrService": self.service, "kSecAttrAccount": self.account}

    def constant(self, name):
        return c.c_void_p.in_dll(self.security, name).value

    def dictionary(self, fields):
        refs = c.c_void_p * len(fields)
        keys = c.addressof(c.c_byte.in_dll(self.cf, "kCFTypeDictionaryKeyCallBacks"))
        values = c.addressof(c.c_byte.in_dll(self.cf, "kCFTypeDictionaryValueCallBacks"))
        return self.cf.CFDictionaryCreate(None, refs(*(self.constant(k) for k in fields)),
                                          refs(*fields.values()), len(fields), keys, values)

    @staticmethod
    def check(result):
        if result:
            raise OSError(result, "macOS Keychain operation failed")

    def read(self):
        query = self.dictionary({**self.query, "kSecReturnData": c.c_void_p.in_dll(self.cf, "kCFBooleanTrue").value})
        data = c.c_void_p()
        try:
            result = self.security.SecItemCopyMatching(query, c.byref(data))
            if result == self.NOT_FOUND:
                return None
            self.check(result)
            return c.string_at(self.cf.CFDataGetBytePtr(data), self.cf.CFDataGetLength(data)).decode("utf-8")
        finally:
            self.cf.CFRelease(query)
            if data:
                self.cf.CFRelease(data)

    def save(self, key):
        encoded = key.encode("utf-8")
        data = self.cf.CFDataCreate(None, encoded, len(encoded))
        query = self.dictionary(self.query)
        changes = self.dictionary({"kSecValueData": data})
        try:
            result = self.security.SecItemUpdate(query, changes)
            if result == self.NOT_FOUND:
                entry = self.dictionary({**self.query, "kSecValueData": data})
                try:
                    result = self.security.SecItemAdd(entry, None)
                finally:
                    self.cf.CFRelease(entry)
                if result == self.DUPLICATE:
                    result = self.security.SecItemUpdate(query, changes)
            self.check(result)
        finally:
            self.cf.CFRelease(changes)
            self.cf.CFRelease(query)
            self.cf.CFRelease(data)

    def delete(self):
        query = self.dictionary(self.query)
        try:
            result = self.security.SecItemDelete(query)
            if result != self.NOT_FOUND:
                self.check(result)
        finally:
            self.cf.CFRelease(query)


@lru_cache(maxsize=8)
def store(platform, account=ACCOUNT):
    if platform == "win32":
        return WindowsStore(account=account)
    if platform == "darwin":
        return MacStore(account=account)
    return None


def catalog_path():
    directory = (Path(os.getenv("LOCALAPPDATA") or Path.home() / "AppData/Local")
                 if sys.platform == "win32" else Path.home() / "Library/Application Support")
    device = directory / "PaperTrace" / "credentials.sqlite3"
    portable = os.getenv("PAPERTRACE_CREDENTIAL_INDEX")
    if portable and not device.exists():
        return Path(portable)
    return device


@contextmanager
def catalog():
    path = catalog_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    try:
        with db:
            db.execute("PRAGMA temp_store=MEMORY")
            db.execute("BEGIN IMMEDIATE")
            db.execute("CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, name TEXT NOT NULL, preview TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS bindings (target TEXT PRIMARY KEY, entry TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS connections (entry TEXT, role TEXT, endpoint TEXT, model TEXT, PRIMARY KEY(entry,role))")
            yield db
    finally:
        db.close()


def selected_account(target, db=None):
    if db is None:
        if sys.platform not in ("win32", "darwin") or not catalog_path().exists():
            return target
        with closing(sqlite3.connect(catalog_path())) as connection:
            return selected_account(target, connection)
    row = db.execute("SELECT entry FROM bindings WHERE target=?", (target,)).fetchone()
    return row[0] if row else target


def active_connection(target, role):
    if sys.platform not in ("win32", "darwin") or not catalog_path().exists():
        return None
    with catalog() as db:
        entry = selected_account(target, db)
        row = db.execute("SELECT e.name,c.endpoint,c.model FROM connections c JOIN entries e ON e.id=c.entry "
                         "WHERE c.entry=? AND c.role=?", (entry, role)).fetchone()
    return dict(name=row[0], endpoint=row[1], model=row[2], entry=entry) if row else None


def system_key():
    try:
        account = selected_account(ACCOUNT)
        vault = store(sys.platform, account) if account else None
        return vault.read() if vault else None
    except (OSError, UnicodeError, sqlite3.Error):
        return None


def deepseek_api_key(endpoint=None):
    connection = active_connection(ACCOUNT, "model")
    if connection:
        if endpoint is not None and endpoint != connection["endpoint"]:
            return None
        vault = store(sys.platform, connection["entry"])
        return vault.read() if vault else None
    return system_key() or os.getenv("DEEPSEEK_API_KEY")

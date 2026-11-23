use serde_json::Value;
use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    fs,
    hash::{Hash, Hasher},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::ipc::Channel;

const AGENT_POLICY: &[u8] = include_bytes!("../../../backend/agent.md");
const WORKER: &[u8] = include_bytes!("../../../backend/papertrace.py");
const LITERATURE: &[u8] = include_bytes!("../../../backend/literature.py");
const WORKBENCH: &[u8] = include_bytes!("../../../backend/workbench.py");
const WIKI: &[u8] = include_bytes!("../../../backend/wiki.py");
const RESEARCH_TOOLS: &[u8] = include_bytes!("../../../backend/research-tools.mjs");
const CITATIONS: &[u8] = include_bytes!("../../../backend/citations.py");
const READER: &[u8] = include_bytes!("../../../backend/reader.py");
const DSH: &[u8] = include_bytes!("../../../backend/dsh.py");
const CREDENTIALS: &[u8] = include_bytes!("../../../backend/credentials.py");
const BIBLIOGRAPHY: &[u8] = include_bytes!("../../../backend/bibliography.py");
const PDF_ENGINE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/pdf-engine.whl"));
const ICORE_CATALOG: &[u8] = include_bytes!("../../../backend/icore-public.csv");
const CCF_CATALOG: &[u8] = include_bytes!("../../../backend/ccf-public.csv");
const VENUE_RANKS: &[u8] = include_bytes!("../../../backend/venue_ranks.py");
type Reply = Result<Value, String>;

struct Pending {
    response: mpsc::Sender<Reply>,
    subscription: Option<(String, Channel<Value>)>,
}

#[derive(Default)]
struct Routes {
    requests: HashMap<String, Pending>,
    subscriptions: HashMap<String, Channel<Value>>,
    disconnected: bool,
}

struct Worker {
    child: Child,
    input: Option<ChildStdin>,
    routes: Arc<Mutex<Routes>>,
}

impl Worker {
    fn start(directory: &Path) -> Result<Self, String> {
        fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        let mut hash = DefaultHasher::new();
        WORKER.hash(&mut hash);
        DSH.hash(&mut hash);
        CREDENTIALS.hash(&mut hash);
        CITATIONS.hash(&mut hash);
        READER.hash(&mut hash);
        LITERATURE.hash(&mut hash);
        WORKBENCH.hash(&mut hash);
        AGENT_POLICY.hash(&mut hash);
        WIKI.hash(&mut hash);
        RESEARCH_TOOLS.hash(&mut hash);
        BIBLIOGRAPHY.hash(&mut hash);
        PDF_ENGINE.hash(&mut hash);
        ICORE_CATALOG.hash(&mut hash);
        CCF_CATALOG.hash(&mut hash);
        VENUE_RANKS.hash(&mut hash);
        let runtime = directory.join("runtime").join(format!("{:016x}", hash.finish()));
        fs::create_dir_all(&runtime).map_err(|error| error.to_string())?;
        let script = runtime.join("papertrace.py");
        for (path, contents) in [
            (&runtime.join("agent.md"), AGENT_POLICY), (&script, WORKER), (&runtime.join("dsh.py"), DSH),
            (&runtime.join("credentials.py"), CREDENTIALS),
            (&runtime.join("literature.py"), LITERATURE), (&runtime.join("workbench.py"), WORKBENCH),
            (&runtime.join("wiki.py"), WIKI),
            (&runtime.join("research-tools.mjs"), RESEARCH_TOOLS),
            (&runtime.join("citations.py"), CITATIONS),
            (&runtime.join("reader.py"), READER),
            (&runtime.join("bibliography.py"), BIBLIOGRAPHY),
            (&runtime.join("pdf-engine.whl"), PDF_ENGINE),
            (&runtime.join("icore-public.csv"), ICORE_CATALOG),
            (&runtime.join("ccf-public.csv"), CCF_CATALOG),
            (&runtime.join("venue_ranks.py"), VENUE_RANKS),
        ] {
            match fs::OpenOptions::new().write(true).create_new(true).open(path) {
                Ok(mut file) => file.write_all(contents).map_err(|error| error.to_string())?,
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    if fs::read(path).ok().as_deref() != Some(contents) {
                        return Err("The embedded worker file does not match this build.".into());
                    }
                }
                Err(error) => return Err(error.to_string()),
            }
        }
        let python = std::env::var_os("PAPERTRACE_PYTHON").unwrap_or_else(|| {
            if cfg!(windows) { "python" } else { "python3" }.into()
        });
        let mut command = Command::new(python);
        command
            .arg("-B")
            .arg("-u")
            .arg(&script)
            .arg(directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|error| format!("Could not start Python 3.9 or newer: {error}"))?;
        let input = child.stdin.take().expect("piped worker input");
        let output = child.stdout.take().expect("piped worker output");
        let routes = Arc::new(Mutex::new(Routes::default()));
        let reader_routes = Arc::clone(&routes);
        thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                let Ok(line) = line else { break };
                let Ok(message) = serde_json::from_str::<Value>(&line) else { break };
                reader_routes.lock().unwrap().receive(message);
            }
            reader_routes.lock().unwrap().disconnect();
        });
        Ok(Self { child, input: Some(input), routes })
    }

    fn send(&mut self, request: &Value, id: &str, pending: Pending) -> Result<(), String> {
        let mut routes = self.routes.lock().unwrap();
        if routes.disconnected {
            return Err("The Python worker disconnected. Retry the request.".into());
        }
        if routes.requests.contains_key(id) {
            return Err("An RPC request with this ID is already in flight.".into());
        }
        routes.requests.insert(id.to_owned(), pending);
        // Keep the route registered before the worker can respond, but release
        // the lock before writing to the pipe so the reader can keep draining.
        drop(routes);
        let result = self.input.as_mut().ok_or_else(|| "The Python worker closed.".to_owned())
            .and_then(|input| {
                writeln!(input, "{request}").and_then(|()| input.flush()).map_err(|error| error.to_string())
            });
        if result.is_err() {
            self.routes.lock().unwrap().disconnect();
        }
        result
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        self.input.take();
        let deadline = Instant::now() + Duration::from_secs(1);
        while Instant::now() < deadline {
            match self.child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => thread::sleep(Duration::from_millis(25)),
                Err(_) => break,
            }
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Routes {
    fn receive(&mut self, message: Value) {
        if let Some(id) = message["id"].as_str() {
            if let Some(pending) = self.requests.remove(id) {
                if let Some((task, channel)) = pending.subscription {
                    if message["result"]["task_id"].as_str() == Some(task.as_str()) {
                        self.subscriptions.insert(task, channel);
                    }
                }
                let _ = pending.response.send(Ok(message));
            }
        } else if message["method"] == "task.event" {
            let event = &message["params"];
            if let Some(task) = event["task_id"].as_str() {
                if let Some(channel) = self.subscriptions.get(task) {
                    if channel.send(event.clone()).is_err() || event["type"] == "task.finished" {
                        self.subscriptions.remove(task);
                    }
                }
            }
        }
    }

    fn disconnect(&mut self) {
        self.disconnected = true;
        self.subscriptions.clear();
        for (_, pending) in self.requests.drain() {
            let _ = pending.response.send(Err("The Python worker disconnected. Retry the request.".into()));
        }
    }
}

#[derive(Clone)]
pub struct Host {
    directory: PathBuf,
    worker: Arc<Mutex<Option<Worker>>>,
}

impl Host {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory, worker: Arc::new(Mutex::new(None)) }
    }

    pub fn request(&self, request: Value, channel: Option<Channel<Value>>) -> Reply {
        let id = request["id"].as_str().filter(|id| !id.is_empty())
            .ok_or_else(|| "RPC request ID must be a nonempty string.".to_owned())?;
        let method = request["method"].as_str().ok_or_else(|| "Missing RPC method.".to_owned())?;
        let subscription = match (method, channel) {
            ("task.subscribe", Some(channel)) => {
                let task = request["params"]["task_id"].as_str()
                    .ok_or_else(|| "Missing task ID.".to_owned())?;
                Some((task.to_owned(), channel))
            }
            ("task.subscribe", None) | (_, Some(_)) => {
                return Err("Task subscriptions require a dedicated channel.".into());
            }
            _ => None,
        };
        let (response, receiver) = mpsc::channel();
        let routes = {
            let mut worker = self.worker.lock().unwrap();
            if worker.as_ref().is_some_and(|worker| worker.routes.lock().unwrap().disconnected) {
                worker.take();
            }
            if worker.is_none() {
                *worker = Some(Worker::start(&self.directory)?);
            }
            let worker = worker.as_mut().unwrap();
            worker.send(&request, id, Pending { response, subscription })?;
            Arc::clone(&worker.routes)
        };
        let timeout = match method {
            "candidate.decide" => 240,
            "library.preview_pdf" | "reader.pdf" | "visual.objects" => 90,
            _ => 20,
        };
        match receiver.recv_timeout(Duration::from_secs(timeout)) {
            Ok(reply) => reply,
            Err(_) => {
                routes.lock().unwrap().requests.remove(id);
                Err("The Python worker timed out.".into())
            }
        }
    }

    pub fn stop(&self) {
        self.worker.lock().unwrap().take();
    }
}

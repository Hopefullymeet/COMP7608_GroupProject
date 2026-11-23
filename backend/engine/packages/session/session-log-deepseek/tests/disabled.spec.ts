import { expect, it } from 'vitest'
import { apply } from '../src/index.ts'

it('does not register upload hooks or settings', () => {
  expect(apply()).toBeUndefined()
})

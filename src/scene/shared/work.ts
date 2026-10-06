/**
 * CPU work spread over frames, like the bake queue but measured in milliseconds: generating
 * a galaxy's particles takes tens of milliseconds, which would freeze a flight if done at
 * once. Each frame spends a small budget on the oldest job.
 */
export interface Work {
  /** Do some work, stopping soon after `deadline` (performance.now()). True when finished. */
  step(deadline: number): boolean
}

const queue: Work[] = []

export function enqueueWork(work: Work) {
  if (!queue.includes(work)) queue.push(work)
}

export function cancelWork(work: Work) {
  const index = queue.indexOf(work)
  if (index >= 0) queue.splice(index, 1)
}

/** True while anything is waiting to be worked on. */
export function workPending(): boolean {
  return queue.length > 0
}

/** Spend up to `budget` milliseconds on the queue, oldest job first. */
export function runWork(budget: number) {
  const deadline = performance.now() + budget
  while (queue.length > 0 && performance.now() < deadline) {
    if (queue[0]!.step(deadline)) queue.shift()
  }
}

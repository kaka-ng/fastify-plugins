import { Collection, Db } from 'mongodb'

declare module 'josk' {

  interface ErrorDetails {
    description: string
    error: Error
    uid: null | string
    task?: unknown
  }

  interface ExecutedDetails {
    uid: string
    date: Date
    delay: number
    timestamp: number
  }

  type OnErrorFunc = (title: string, details: ErrorDetails) => void
  type OnExecutedFunc = (uid: string, details: ExecutedDetails) => void
  type AsyncTaskFunc = () => Promise<void>
  type SyncTaskFunc = () => void
  type SyncNextTaskFunc = (ready: (next?: Date) => void) => void

  export interface JoSkOptions {
    adapter: unknown
    debug?: boolean
    autoClear?: boolean
    zombieTime?: number
    minRevolvingDelay ?: number
    maxRevolvingDelay ?: number
    onError?: OnErrorFunc | false
    onExecuted?: OnExecutedFunc | false
  }

  export class JoSk {
    debug: boolean
    autoClear: boolean
    isDestroyed: boolean
    zombieTime: number
    minRevolvingDelay: number
    maxRevolvingDelay: number
    onError: OnErrorFunc | false
    onExecuted: OnExecutedFunc | false
    nextRevolutionTimeout: null | NodeJS.Timeout

    tasks: Record<string, AsyncTaskFunc | SyncTaskFunc>

    // Public API
    constructor (options: JoSkOptions)
    async ping (): Promise<void>
    async setInterval (func: AsyncTaskFunc | SyncNextTaskFunc, delay: number, uid: string): Promise<string>
    async setTimeout (func: AsyncTaskFunc | SyncTaskFunc, delay: number, uid: string): Promise<string>
    async setImmediate (func: AsyncTaskFunc | SyncTaskFunc, uid: string): Promise<string>
    async clearInterval (uid: string): Promise<boolean>
    async clearTimeout (uid: string): Promise<boolean>
    destroy (): boolean

    // Internal API
    _debug (...args: unknown): void
    __checkState (): boolean
    async __remove (timerId: string): Promise<boolean>
    async __add (uid: string, isInterval: boolean, delay: number): Promise<void>
    async __execute (task: AsyncTaskFunc | SyncTaskFunc): Promise<boolean | undefined>
    async __iterate (): Promise<void>
    __tick (): void
    __errorHandler (error: Error, title: string, description: string, uid: string): void
  }

  export interface RedisAdapterOptions {
    client: unknown
    prefix?: string
    resetOnInit?: boolean
  }

  export class RedisAdapter {
    constructor (options: RedisAdapterOptions)

    async ping (): Promise<void>
    async acquireLock (): Promise<boolean>
    async releaseLock (): Promise<void>
    async remove (uid: string): Promise<boolean>
    async add (uid: string, isInterval: boolean, delay: number): Promise<boolean>
    async update (task: unknown, nextExecuteAt: Date): Promise<boolean>
    async iterate (nextExecuteAt: Date): Promise<void>

    __getTaskKey (uid: string): void
  }

  export interface MongoAdapterOptions {
    db: Db
    lockCollectionName?: string
    prefix?: string
    resetOnInit?: boolean
  }

  export class MongoAdapter {
    db: Db
    prefix: string
    uniqueName: string
    lockCollectionName: string
    collection: Collection
    lockCollection: Collection

    constructor (options: MongoAdapterOptions)

    async ping (): Promise<void>
    async acquireLock (): Promise<boolean>
    async releaseLock (): Promise<void>
    async remove (uid: string): Promise<boolean>
    async add (uid: string, isInterval: boolean, delay: number): Promise<boolean>
    async update (task: unknown, nextExecuteAt: Date): Promise<boolean>
    async iterate (nextExecuteAt: Date): Promise<void>
  }
}
# @kakang/fastify-cronjob

[![Continuous Integration](https://github.com/kaka-ng/fastify-plugins/actions/workflows/ci-cronjob.yml/badge.svg)](https://github.com/kaka-ng/fastify-plugins/actions/workflows/ci-cronjob.yml)
[![NPM version](https://img.shields.io/npm/v/@kakang/fastify-cronjob.svg?style=flat)](https://www.npmjs.com/package/@kakang/fastify-cronjob)

This plugin is inspired by [JoSK](https://github.com/veliovgroup/josk)
for managing cronjob in Node.js cluster

## Install

```bash
npm install @kakang/fastify-cronjob --save

yarn add @kakang/fastify-cronjob
```

## Usage

```ts
import { fastifyCronJob } from '@kakang/fastify-cronjob'
import { MongoDBAdapter } from '@kakang/fastify-cronjob/lib/adapter/mongodb'
import { MongoClient } from 'mongodb'

const client = new MongoClient('mongodb://127.0.0.1:27017')
await client.connect()
const db = client.db('cronjob')

fastify.register(fastifyCronJob, {
  adapter: MongoDBAdapter,
  adapterOptions: {
    application: 'cronjob',
    db
  }
})
```

## API

### .setInterval(fn, ms, uid[, context])

Job that runs on defined interval

```ts
fastify.cronjob.setInterval(async function(context) {
  // run in async
}, 1000, 'async')

// if you perfer in sync
// please return Promise
fastify.cronjob.setInterval(function (context) {
  const promise = {}
  promise.promise = new Promise(function(resolve, reject) {
    promise.resolve = resolve
    promise.reject = reject
  })

  setImmediate(function() {
    resolve()
  })

  return promise.promise
}, 1000, 'promise')
```

### .setTimeout(fn, ms, uid[, context])

Job that runs on defined timeout

```ts
fastify.cronjob.setTimeout(async function(context) {
  // run in async
}, 1000, 'async')

// if you perfer in sync
// please return Promise
fastify.cronjob.setTimeout(function (context) {
  const promise = {}
  promise.promise = new Promise(function(resolve, reject) {
    promise.resolve = resolve
    promise.reject = reject
  })

  setImmediate(function() {
    resolve()
  })

  return promise.promise
}, 1000, 'promise')
```

### .setImmediate(fn, uid[, context])

Job that runs immediately

```ts
fastify.cronjob.setImmediate(async function(context) {
  // run in async
}, 'async')

// if you perfer in sync
// please return Promise
fastify.cronjob.setImmediate(function (context) {
  const promise = {}
  promise.promise = new Promise(function(resolve, reject) {
    promise.resolve = resolve
    promise.reject = reject
  })

  setImmediate(function() {
    resolve()
  })

  return promise.promise
}, 'promise')
```

### .setCronJob(fn, cron, uid[, context])

Job that runs on defined cron string

```ts
fastify.cronjob.setCronJob(async function(context) {
  // run in async
}, '* * * * * *', 'async')

// if you perfer in sync
// please return Promise
fastify.cronjob.setCronJob(function (context) {
  const promise = {}
  promise.promise = new Promise(function(resolve, reject) {
    promise.resolve = resolve
    promise.reject = reject
  })

  setImmediate(function() {
    resolve()
  })

  return promise.promise
}, '* * * * * *', 'promise')
```

### .setLoopTask(fn, uid[, context])

Job that runs immediately one follow the other.

```ts
fastify.cronjob.setLoopTask(async function(context) {
  // run in async
}, 'async')

// if you perfer in sync
// please return Promise
fastify.cronjob.setLoopTask(function (context) {
  const promise = {}
  promise.promise = new Promise(function(resolve, reject) {
    promise.resolve = resolve
    promise.reject = reject
  })

  setImmediate(function() {
    resolve()
  })

  return promise.promise
}, 'promise')
```

### .clearInterval(uid)

Remove cronjob by uid.

```ts
const uid = await fastify.cronjob.setInterval(async function(context) {
  // run in async
}, 1000, 'async')

fastify.cronjob.clearInterval(uid)
```

### .clearTimeout(uid)

Alias of `.clearInterval`

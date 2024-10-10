import dotenv from 'dotenv'
dotenv.config()

// Use environment variables for local
// Use fallback value for Github Actions
export const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://127.0.0.1:27017/?replicaSet=rs0'

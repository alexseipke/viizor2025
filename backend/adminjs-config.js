const AdminJS = require('adminjs')
const AdminJSExpress = require('@adminjs/express')
const AdminJSSQL = require('@adminjs/sql')
const { Pool } = require('pg')

require('dotenv').config({ path: '.env.social' })

AdminJS.registerAdapter({
  Resource: AdminJSSQL.Resource,
  Database: AdminJSSQL.Database,
})

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
})

const adminJs = new AdminJS({
  databases: [pool],
  branding: { companyName: 'Viizor Social' }
})

const adminRouter = AdminJSExpress.buildRouter(adminJs)

module.exports = { adminJs, adminRouter }

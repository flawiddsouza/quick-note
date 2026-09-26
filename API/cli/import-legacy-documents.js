// One-off: copies every user's notes from the document saved by the app before rows into
// the notes and categories tables. Safe to rerun, imported users are skipped, and a user
// whose document cannot be read is reported and left for the next run rather than
// stopping the others. user_store and user_client_store are left untouched as a fallback copy.
//
//   node cli/import-legacy-documents.js
import 'dotenv/config'
import { listUsers } from '../db.js'
import { importLegacyDocument } from '../migrate.js'
import { shutdown } from '../sync.js'
import sql from '../sql.js'

let failed = 0

for(const user of await listUsers()) {
    try {
        const result = await importLegacyDocument(user)
        const details = result.status === 'imported' ? ` ${result.notes} notes, ${result.categories} categories` : ''
        console.log(`user ${user.id} ${user.email}: ${result.status}${details}`)
    } catch(error) {
        failed++
        console.error(`user ${user.id} ${user.email}: FAILED ${error.message}`)
    }
}

shutdown()
await sql.end()
process.exit(failed > 0 ? 1 : 0)

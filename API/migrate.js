import { getLegacyDocument, markLegacyImported } from './db.js'
import { pull, push } from './sync.js'
import { readLegacyDocument } from './legacy.js'

// Copies a user's notes from the document saved in user_store by the app before rows into
// the notes and categories tables, unencrypted, and marks the user as imported. Returns
// what happened, so the command line script can report it.
export async function importLegacyDocument(user) {
    if(user.legacy_imported) {
        return { status: 'already imported' }
    }

    const legacyDocument = await getLegacyDocument(user.id)

    if(!legacyDocument) {
        await markLegacyImported(user.id)
        return { status: 'nothing to import' }
    }

    // a user who already has rows was not imported by this script, so nothing is added to them
    if((await pull(user.id, 0, 1)).seq > 0) {
        return { status: 'rows already present, not imported' }
    }

    const contents = readLegacyDocument(legacyDocument)
    const asNew = row => ({ ...row, version: 0, deleted: false })
    await push(user.id, { categories: contents.categories.map(asNew), notes: contents.notes.map(asNew) })
    await markLegacyImported(user.id)
    return { status: 'imported', notes: contents.notes.length, categories: contents.categories.length }
}

// Reads the document the app saved in IndexedDB before it kept rows and returns its
// categories and notes as plain objects. The reader is the library that wrote them,
// automerge 1.0.1-preview.7: Automerge 3 refuses some of these documents ("mismatching
// heads"), the old one reads them all. Only loaded on the first start after the upgrade,
// see sync.js.
import * as Automerge from 'automerge'

const plain = value => typeof value === 'string' ? value : String(value ?? '')
const plainId = value => value === null || value === undefined ? null : plain(value)

export async function readLegacyDocument(bytes) {
    const doc = Automerge.load(bytes)

    return {
        categories: [...doc.categories ?? []].map(category => ({
            id: plain(category.id),
            name: plain(category.name),
            created: plain(category.created),
            modified: plain(category.modified)
        })),
        notes: [...doc.notes ?? []].map(note => ({
            id: plain(note.id),
            categoryId: plainId(note.categoryId),
            title: plain(note.title),
            content: plain(note.content),
            created: plain(note.created),
            modified: plain(note.modified)
        }))
    }
}

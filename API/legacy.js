import Automerge from 'automerge'

// Reads a document saved by the app before rows and returns its categories and notes as
// plain objects. The reader is the library that wrote them, automerge 1.0.1-preview.7:
// Automerge 3 refuses some of these documents ("mismatching heads"), the old one reads
// them all. Old data is never changed in place: it is read here and copied into rows by
// migrate.js.
const plain = value => typeof value === 'string' ? value : String(value ?? '')

export function readLegacyDocument(bytes) {
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
            categoryId: note.categoryId === null || note.categoryId === undefined ? null : plain(note.categoryId),
            title: plain(note.title),
            content: plain(note.content),
            created: plain(note.created),
            modified: plain(note.modified)
        }))
    }
}

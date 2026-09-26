// Three-way merge of a note or category edited on this device and on another at the same
// time. `base` is the row as the server last had it before this device changed it, `local`
// what this device made of it, `server` what the other device made of it.
//
// Text is merged line by line with diff3: a line changed on one side only takes that change,
// a line changed the same way on both sides is not a conflict, and a line changed differently
// on both sides is. A conflict is never resolved by guessing: the caller keeps the server
// version and saves the local version as a copy, so nothing typed is lost.
import { diff3Merge } from 'node-diff3'

const lines = text => text === '' ? [] : text.split('\n')

// the merged text, or `conflict` when the two sides changed the same lines differently
export function mergeText(base, local, server) {
    if(local === server || base === server) {
        return { text: local, conflict: false }
    }
    if(base === local) {
        return { text: server, conflict: false }
    }

    const regions = diff3Merge(lines(local), lines(base), lines(server), { excludeFalseConflicts: true })
    if(regions.some(region => region.conflict)) {
        return { text: local, conflict: true }
    }
    return { text: regions.flatMap(region => region.ok).join('\n'), conflict: false }
}

// a value with no lines to merge: the side that changed it wins, this device when both did
export function mergeValue(base, local, server) {
    return local === base ? server : local
}

export function mergeNote(base, local, server) {
    const title = mergeText(base.title, local.title, server.title)
    const content = mergeText(base.content, local.content, server.content)
    return {
        note: { ...local, title: title.text, content: content.text, categoryId: mergeValue(base.categoryId, local.categoryId, server.categoryId) },
        conflict: title.conflict || content.conflict
    }
}

export function mergeCategory(base, local, server) {
    return { ...local, name: mergeValue(base.name, local.name, server.name) }
}

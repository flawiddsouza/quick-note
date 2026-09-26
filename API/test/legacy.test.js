import { describe, it, expect } from 'vitest'
import { readLegacyDocument } from '../legacy.js'
import { legacyDocumentBytes, legacyDocumentContents } from './fixtures/legacy-document.js'

describe('readLegacyDocument', () => {
    it('reads a document saved by the automerge 1.0.1-preview.7 build as plain values', () => {
        expect(readLegacyDocument(legacyDocumentBytes)).toEqual(legacyDocumentContents)
    })
})

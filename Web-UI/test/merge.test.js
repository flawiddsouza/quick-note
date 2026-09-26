import { describe, it, expect } from 'vitest'
import { mergeText, mergeValue, mergeNote, mergeCategory } from '../src/merge'
import { prose } from './helpers'

describe('mergeText', () => {
    const base = 'one\ntwo\nthree\nfour'

    it('takes the side that changed when only one did', () => {
        expect(mergeText(base, base, 'one\ntwo\nthree\nfour\nfive')).toEqual({ text: 'one\ntwo\nthree\nfour\nfive', conflict: false })
        expect(mergeText(base, 'ONE\ntwo\nthree\nfour', base)).toEqual({ text: 'ONE\ntwo\nthree\nfour', conflict: false })
        expect(mergeText(base, base, base)).toEqual({ text: base, conflict: false })
    })

    it('combines changes to different lines', () => {
        expect(mergeText(base, 'ONE\ntwo\nthree\nfour', 'one\ntwo\nthree\nFOUR')).toEqual({ text: 'ONE\ntwo\nthree\nFOUR', conflict: false })
        expect(mergeText(base, 'one\ntwo\nthree\nfour\nmine', 'zero\none\ntwo\nthree\nfour')).toEqual({ text: 'zero\none\ntwo\nthree\nfour\nmine', conflict: false })
        expect(mergeText(base, 'one\nthree\nfour', 'one\ntwo\nthree')).toEqual({ text: 'one\nthree', conflict: false })
    })

    it('is not a conflict when both sides made the same change', () => {
        expect(mergeText(base, 'one\ntwo\nthree\nfour\nsame', 'one\ntwo\nthree\nfour\nsame')).toEqual({ text: 'one\ntwo\nthree\nfour\nsame', conflict: false })
    })

    it('is a conflict when both sides changed the same line differently', () => {
        expect(mergeText(base, 'one\nmine\nthree\nfour', 'one\ntheirs\nthree\nfour')).toEqual({ text: 'one\nmine\nthree\nfour', conflict: true })
        expect(mergeText('', 'mine', 'theirs')).toEqual({ text: 'mine', conflict: true })
    })

    it('handles empty sides', () => {
        expect(mergeText('', '', 'theirs')).toEqual({ text: 'theirs', conflict: false })
        expect(mergeText('text', '', 'text')).toEqual({ text: '', conflict: false })
        expect(mergeText('text', 'text', '')).toEqual({ text: '', conflict: false })
    })

    it('merges a long note in reasonable time', () => {
        const text = prose(20, 7)
        const lines = text.split('\n')
        const mine = [...lines.slice(0, 3), 'a line added near the top', ...lines.slice(3)].join('\n')
        const theirs = [...lines.slice(0, -2), 'a line added near the end', ...lines.slice(-2)].join('\n')

        const started = performance.now()
        const result = mergeText(text, mine, theirs)
        expect(performance.now() - started).toBeLessThan(500)
        expect(result.conflict).toBe(false)
        expect(result.text).toContain('a line added near the top')
        expect(result.text).toContain('a line added near the end')
    })
})

describe('mergeValue', () => {
    it('takes the changed side, this device when both changed', () => {
        expect(mergeValue('a', 'a', 'b')).toBe('b')
        expect(mergeValue('a', 'b', 'a')).toBe('b')
        expect(mergeValue('a', 'b', 'c')).toBe('b')
        expect(mergeValue(null, null, 'c')).toBe('c')
    })
})

describe('mergeNote and mergeCategory', () => {
    const base = { title: 'Title', content: 'one\ntwo', categoryId: null }

    it('merges every field on its own', () => {
        const { note, conflict } = mergeNote(base, { ...base, title: 'Mine', modified: 'm' }, { ...base, content: 'one\ntwo\nthree', categoryId: 'c' })
        expect(conflict).toBe(false)
        expect(note).toEqual({ title: 'Mine', content: 'one\ntwo\nthree', categoryId: 'c', modified: 'm' })
    })

    it('reports a conflict in either text', () => {
        expect(mergeNote(base, { ...base, title: 'Mine' }, { ...base, title: 'Theirs' }).conflict).toBe(true)
        expect(mergeNote(base, { ...base, content: 'one\nmine' }, { ...base, content: 'one\ntheirs' }).conflict).toBe(true)
    })

    it('merges a category name', () => {
        expect(mergeCategory({ name: 'a' }, { id: 'c', name: 'a' }, { name: 'b' })).toEqual({ id: 'c', name: 'b' })
        expect(mergeCategory({ name: 'a' }, { id: 'c', name: 'mine' }, { name: 'theirs' })).toEqual({ id: 'c', name: 'mine' })
    })
})

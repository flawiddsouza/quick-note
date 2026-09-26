// A document saved by the automerge 1.0.1-preview.7 build the app used before automerge-repo:
// one category and two notes, one of them in the category.
export const legacyDocumentBytes = Uint8Array.from(
    atob('hW9KgxOkaOsArwQCAgAAEDSrxan6VEvvtq9E0PjvVxYBKb2WdGMNiHzapYmmlBn9bSNZGjB/pEgmoPbiNf7Y/7gIAQQDBRMFIwk1AkAEQwRWAgwBBgIMEQYTCBWIASEEIxA0A0IGVhxXxQGAAQJ/AAMBfgEAAgF+AgUCB34Ar8Pb1QYCAAQAfwADAX8AAgEEBwACAwAQAQACfwECAgQDBggGDwAEfwEAEAACAgB/CAAQfgpjYXRlZ29yaWVzBW5vdGVzAANwB2NyZWF0ZWQCaWQIbW9kaWZpZWQEbmFtZQpjYXRlZ29yeUlkB2NvbnRlbnQHY3JlYXRlZAJpZAhtb2RpZmllZAV0aXRsZQpjYXRlZ29yeUlkB2NvbnRlbnQHY3JlYXRlZAJpZAhtb2RpZmllZAV0aXRsZQIAEwEDAX0FB3UDAX8CBQF/AgUBAgMQAgIDABABBQBwhgNGhgNGAKYBhgNWhgOGAUbWAYYDVoYDBjIwMjMtMDEtMDFUMDA6MDA6MDAuMDAwWmNhdDEyMDIzLTAxLTAyVDAwOjAwOjAwLjAwMFpXb3JrbWlsaywgZWdnczIwMjMtMDEtMDNUMDA6MDA6MDAuMDAwWm5vdGUxMjAyMy0wMS0wNFQwMDowMDowMC4wMDBaU2hvcHBpbmdjYXQxY2FsbCB0aGUgYmFuazIwMjMtMDEtMDVUMDA6MDA6MDAuMDAwWm5vdGUyMjAyMy0wMS0wNlQwMDowMDowMC4wMDBaFQAD'),
    char => char.charCodeAt(0)
)

export const legacyDocumentContents = {
    categories: [
        { id: 'cat1', name: 'Work', created: '2023-01-01T00:00:00.000Z', modified: '2023-01-02T00:00:00.000Z' }
    ],
    notes: [
        { id: 'note1', categoryId: null, title: 'Shopping', content: 'milk, eggs', created: '2023-01-03T00:00:00.000Z', modified: '2023-01-04T00:00:00.000Z' },
        { id: 'note2', categoryId: 'cat1', title: '', content: 'call the bank', created: '2023-01-05T00:00:00.000Z', modified: '2023-01-06T00:00:00.000Z' }
    ]
}

export async function up(sql) {
    // seq: the user's change counter, every accepted row write takes the next number.
    // The encryption columns are set for accounts whose notes are encrypted on the device,
    // see routes.js; legacy_imported marks users whose old document was copied into rows.
    await sql`
        ALTER TABLE users
            ADD COLUMN seq bigint NOT NULL DEFAULT 0,
            ADD COLUMN encrypted boolean NOT NULL DEFAULT false,
            ADD COLUMN salt text,
            ADD COLUMN wrapped_key text,
            ADD COLUMN recovery_salt text,
            ADD COLUMN recovery_wrapped_key text,
            ADD COLUMN recovery_password text,
            ADD COLUMN legacy_imported boolean NOT NULL DEFAULT false
    `

    // A deleted row stays as a tombstone with its fields blanked, so other devices learn
    // of the deletion. version counts the writes to a row, seq says when it was last written.
    await sql`
        CREATE TABLE categories (
            user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            id text NOT NULL,
            name text NOT NULL,
            created text NOT NULL,
            modified text NOT NULL,
            version integer NOT NULL,
            seq bigint NOT NULL,
            deleted boolean NOT NULL DEFAULT false,
            PRIMARY KEY(user_id, id)
        )
    `
    await sql`CREATE INDEX categories_seq ON categories(user_id, seq)`

    await sql`
        CREATE TABLE notes (
            user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            id text NOT NULL,
            category_id text,
            title text NOT NULL,
            content text NOT NULL,
            created text NOT NULL,
            modified text NOT NULL,
            version integer NOT NULL,
            seq bigint NOT NULL,
            deleted boolean NOT NULL DEFAULT false,
            PRIMARY KEY(user_id, id)
        )
    `
    await sql`CREATE INDEX notes_seq ON notes(user_id, seq)`
}

export async function down(sql) {
    await sql`DROP TABLE notes`
    await sql`DROP TABLE categories`
    await sql`
        ALTER TABLE users
            DROP COLUMN seq,
            DROP COLUMN encrypted,
            DROP COLUMN salt,
            DROP COLUMN wrapped_key,
            DROP COLUMN recovery_salt,
            DROP COLUMN recovery_wrapped_key,
            DROP COLUMN recovery_password,
            DROP COLUMN legacy_imported
    `
}

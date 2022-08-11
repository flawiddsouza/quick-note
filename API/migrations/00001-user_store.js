export async function up(sql) {
	await sql`
        CREATE TABLE user_store (
            user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            key text NOT NULL,
            value bytea NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(user_id, key)
        )
    `
}

export async function down(sql) {
	await sql`
        DROP TABLE user_store
    `
}

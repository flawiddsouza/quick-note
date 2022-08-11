export async function up(sql) {
	await sql`
        CREATE TABLE user_client_store (
            user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            client_id TEXT NOT NULL,
            key text NOT NULL,
            value bytea NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(user_id, client_id, key)
        )
    `
}

export async function down(sql) {
	await sql`
        DROP TABLE user_client_store
    `
}

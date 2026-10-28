# MongoDB Atlas setup (free M0 cluster)

The app stores its data in MongoDB. These steps connect it to a free Atlas cluster. It takes about 10 minutes.

> **Your tests never touch Atlas.** `npm run test` starts its own temporary in-memory MongoDB, so you can run tests as often as you like without affecting your Atlas data.

## 1. Create the cluster

1. Sign up or log in at <https://cloud.mongodb.com> and create a project (for example `quickcart-compare`).
2. Choose **Create** (or **Build a Database**), pick the **M0 Free** tier, and choose a provider and a region close to you (for India, an AWS Mumbai region is a good choice). Keep the default name `Cluster0` or pick your own.

## 2. Create a database user

1. Open **Security > Database Access** and add a database user with password authentication.
2. Use a generated password and copy it somewhere safe. Give the user **Read and write to any database** (or read/write on just `quickcart-compare`).
3. Prefer a password with only letters and digits. If it contains special characters such as `@ : / ? # %`, you must URL-encode them in the connection string (`@` becomes `%40`).

## 3. Allow your IP address

Open **Security > Network Access > Add IP Address**.

- For local development choose **Add Current IP Address**. If your home or office IP changes, repeat this step.
- For a throwaway demo, or for hosting on a service whose IP addresses change (Phase 8), you can allow `0.0.0.0/0` ("anywhere"). That is convenient but means only the database password protects the cluster, so use a strong password, a user limited to this one database, and never reuse the password elsewhere.

## 4. Get the connection string

1. In Atlas click **Connect** on your cluster, then **Drivers**, then choose Node.js.
2. Copy the string. It looks like:
   `mongodb+srv://<db-user>:<db-password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
3. Replace `<db-user>` and `<db-password>`, and **add the database name** between `.net/` and `?`:
   `mongodb+srv://appuser:YourPassword@cluster0.xxxxx.mongodb.net/quickcart-compare?retryWrites=true&w=majority`

   Without a database name MongoDB silently uses a database called `test`. The app refuses to start without one, to protect you from that.

## 5. Put it in `.env` and seed

```bash
cp .env.example .env        # if you have not already
# edit .env: set MONGODB_URI (from step 4) and JWT_SECRET (32+ random characters)
npm run seed                # loads the SAMPLE data into Atlas
npm run dev
```

Check it worked:

- The seed prints `Done: { providers: 3, serviceAreas: 12, products: 40, listings: 119, quotes: 8 }`.
- <http://localhost:4000/api/v1/health> shows `"database": "connected"`.
- In Atlas, **Browse Collections** shows the `quickcart-compare` database.

## Things to know about seeding

- `npm run seed` **replaces** providers, service areas, products, listings and quotes in the database named in `MONGODB_URI`. It never touches admin users or the audit log.
- Use a database name dedicated to this project so the seed cannot overwrite anything else.
- It is safe to run repeatedly. IDs are deterministic, so baskets saved in a browser keep working after a reseed.
- With `NODE_ENV=production` the seed refuses to run unless you set `ALLOW_SEED=true`.

## Troubleshooting

The server and seed script print a hint for the common failures:

| Message                                     | Likely cause and fix                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI must start with mongodb://`    | You pasted a web link. Use the connection string from **Connect > Drivers**.                              |
| `MONGODB_URI still contains <placeholders>` | You left `<db-password>` style brackets in. Replace them, including the brackets.                         |
| `MONGODB_URI must include a database name`  | Add `/quickcart-compare` before the `?` (step 4).                                                         |
| `Authentication failed` / `bad auth`        | Wrong user or password, or special characters not URL-encoded. Reset the password in Database Access.     |
| `Server selection timed out`                | Your IP is not in Network Access (step 3), a VPN or firewall blocks port 27017, or the cluster is paused. |
| `querySrv ENOTFOUND`                        | The host in the string is wrong or DNS is failing. Copy the string again from Atlas.                      |
| TLS / certificate errors                    | Wrong system clock, or a VPN or proxy intercepting TLS.                                                   |

Free (M0) clusters may be paused after a long period of inactivity. If that happens, resume the cluster from the Atlas dashboard.

## Security reminders

- `.env` is git-ignored. Never commit it, paste it in chat, or put the connection string in client code (the client only gets `VITE_` variables, and the database URI is not one of them).
- If a password leaks, reset it in **Database Access** and update `.env`.
- The server logs only the host and database name, never the password.

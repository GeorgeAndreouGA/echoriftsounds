# EchoRiftSounds 🎵

A retro-styled music streaming and sharing web application built with Node.js and Express, featuring a cyberpunk aesthetic with scheduled track releases and a secure admin panel.

## Features

- **Retro Cyberpunk UI** - Beautiful neon-styled interface with the Orbitron font and animated effects
- **Music Streaming** - Stream MP3, WAV, and FLAC audio files directly from the browser
- **Scheduled Releases** - Schedule tracks to be published at a specific date and time
- **Admin Panel** - Secure admin interface for managing published and scheduled tracks
- **Docker Support** - Fully containerized with Docker and PM2 cluster mode
- **Security Hardened** - Rate limiting, CSRF protection, IP whitelisting, Helmet.js headers, and bcrypt password hashing

## Tech Stack

- **Backend**: Node.js, Express 5
- **Process Manager**: PM2 (cluster mode)
- **Containerization**: Docker & Docker Compose
- **Security**: Helmet.js, express-rate-limit, csurf, bcrypt, express-basic-auth
- **Frontend**: Vanilla HTML/CSS/JavaScript with retro styling

## Project Structure

```
echoriftsounds/
├── generate-hash.js          # Utility to generate bcrypt password hashes
├── README.md
└── source_code/
    ├── docker-compose.yml    # Docker Compose configuration
    ├── Dockerfile            # Multi-stage Docker build
    ├── ecosystem.config.js   # PM2 cluster configuration
    ├── package.json          # Node.js dependencies
    ├── published.json        # List of published tracks
    ├── scheduled.json        # List of scheduled track releases
    ├── server.js             # Express server application
    └── html/
        ├── admin.html        # Admin panel interface
        └── index.html        # Public music player interface
```

## Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- A directory containing your music files (MP3, WAV, FLAC)

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd echoriftsounds
```

### 2. Generate Admin Password Hash

```bash
cd source_code
npm install bcrypt
```

Edit `generate-hash.js` and set your desired password:

```javascript
const password = 'yourStrongPasswordHere';
```

Run the script:

```bash
node ../generate-hash.js
```

Copy the generated hash for the next step.

### 3. Configure Environment Variables

Create a `.env` file in the `source_code` directory:

```env
# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$your_generated_hash_here

# Admin IP Whitelist (comma-separated, supports CIDR notation)
ADMIN_IPS=192.168.1.0/24,10.0.0.0/8

# Site Configuration
SITE_NAME=EchoRiftSounds
YOUTUBE_URL=https://youtube.com/@yourchannel

# Security
COOKIE_SECRET=your_random_secret_here
NODE_ENV=production
```

### 4. Configure Docker Compose

Edit `docker-compose.yml` to point to your music directory:

```yaml
volumes:
  - /path/to/your/music:/app/music:ro
```

### 5. Build and Run

```bash
cd source_code
docker-compose up -d --build
```

The application will be available at `http://localhost:3000`.

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ADMIN_USERNAME` | Admin panel username | Yes |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of admin password | Yes |
| `ADMIN_IPS` | Comma-separated list of allowed admin IPs (CIDR supported) | Yes |
| `SITE_NAME` | Name displayed on the public interface | Yes |
| `YOUTUBE_URL` | YouTube channel link (optional) | No |
| `COOKIE_SECRET` | Secret for cookie signing | Recommended |
| `NODE_ENV` | Set to `production` for secure cookies | Recommended |

### File Permissions

Ensure correct permissions for both host and container:

- **Directories**: `755`
- **Files**: `644`

```bash
chmod 755 source_code source_code/html
chmod 644 source_code/*.json source_code/html/*.html
```

## Usage

### Public Interface

- Access the music player at `http://your-domain/` or `http://your-domain/index`
- Browse and stream published tracks
- Download tracks directly
- Search through available music

### Admin Panel

- Access the admin panel at `http://your-domain/admin`
- **Note**: Admin access is restricted by IP whitelist
- Authenticate with your configured credentials

#### Admin Features

1. **Publish Tracks** - Immediately make tracks available to the public
2. **Schedule Tracks** - Set a future date/time for automatic release
3. **Unpublish Tracks** - Remove tracks from the public listing
4. **Cancel Scheduled Releases** - Remove pending scheduled tracks

### Accessing Admin Panel

By default, the `/admin` endpoint is accessible from the internet (protected by IP whitelisting, rate limiting, and authentication in the app itself).

However, the **recommended production setup** uses the provided nginx configuration to isolate the admin panel on a **separate port (3003)**, adding an extra layer of security:

#### With Nginx Config (Recommended)

The nginx config uses two server blocks:
- **Port 443** - Public interface (`/index`, `/music/`, `/published`) - exposed to the internet
- **Port 3003** - Admin interface (`/admin`, `/scheduled`) - restricted with nginx IP whitelist

This provides multiple layers of security:

1. **Nginx IP Whitelisting** - Only allowed IPs can reach the admin port
2. **Application IP Whitelisting** - Second layer of IP checking in the Node.js app
3. **Rate Limiting** - 5 attempts per 5 minutes
4. **Basic Auth with bcrypt** - Password hashing with salt rounds of 12
5. **CSRF Protection** - All form submissions require valid tokens

To access the admin panel:
1. Ensure your IP is in the nginx `allow` list
2. Ensure your IP is in the `ADMIN_IPS` environment variable
3. Navigate to `https://your-domain:3003/admin`

#### Without Nginx Config (Direct Access)

If you're not using the provided nginx config, the admin panel is accessible directly at `https://your-domain/admin`. It's still protected by:
- Application-level IP whitelisting (`ADMIN_IPS`)
- Rate limiting
- Basic authentication with bcrypt
- CSRF protection

This is less secure than the nginx setup but still functional for testing or simple deployments.

#### Remote Access Options

If accessing from outside your whitelisted network:

1. **VPN** (Recommended): Connect to your home/server VPN, then access admin using your VPN IP
2. **Local DNS / Pi-hole**: Configure your local DNS to resolve the domain
3. **Edit `/etc/hosts`**: Add the server IP to your hosts file

**Note**: If using `/etc/hosts`, remember to remove the entry when accessing the public interface from outside your network.

## Security Features

- **Rate Limiting**: 5 attempts per 5 minutes on admin routes
- **IP Whitelisting**: Admin panel restricted to configured IPs
- **CSRF Protection**: All admin form submissions protected
- **Secure Headers**: Helmet.js with strict CSP
- **Password Hashing**: bcrypt with salt rounds of 12
- **Input Validation**: Filename and path traversal protection
- **Non-root Container**: Docker runs as unprivileged user

## Development

### Local Development

```bash
cd source_code
npm install
node server.js
```

### PM2 Commands (inside container)

```bash
# View cluster status
docker exec echoriftsounds-app pm2 status

# View logs
docker exec echoriftsounds-app pm2 logs

# Restart cluster
docker exec echoriftsounds-app pm2 restart all
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Redirect to `/index` |
| `/index` | GET | Public music player |
| `/music/:file` | GET | Stream/download audio file |
| `/published.json` | GET | List of published tracks |
| `/scheduled.json` | GET | List of scheduled tracks |
| `/admin` | GET | Admin panel (protected) |
| `/admin/files` | GET | List all available files |
| `/admin/publish` | POST | Publish/schedule tracks |
| `/admin/delete` | POST | Unpublish tracks |
| `/admin/scheduled/delete` | POST | Cancel scheduled releases |
| `/admin/token` | GET | Refresh CSRF token |

## Supported Audio Formats

- MP3 (`.mp3`)
- WAV (`.wav`)
- FLAC (`.flac`)

## Troubleshooting

### Admin panel returns 403 Forbidden

Your IP is not in the `ADMIN_IPS` whitelist. Check your current IP and update the environment variable.

### Scheduled tracks not releasing

The scheduled release check runs on every request. If there's no traffic, tracks won't release automatically. Consider adding a health check or cron job to trigger releases.

### Container permission issues

Ensure the music directory is readable by UID 1001:

```bash
chown -R 1001:1001 /path/to/music
# or
chmod -R 755 /path/to/music
```

## License

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.

### You CAN:
-  Use for personal, non-commercial projects
-  Study, modify, and improve the code
-  Distribute copies with your changes
-  Use for educational or research purposes
-  Use in nonprofit organizations

### You CANNOT:
-  Use for commercial purposes
-  Sell the software or derivatives
-  Use to provide commercial services
-  Deploy for business profit

### Contributions Welcome
Improvements, bug fixes, and new features are encouraged! Please submit contributions back to the original project so everyone can benefit.

See the [LICENSE](LICENSE) file for full details or visit:
https://polyformproject.org/licenses/noncommercial/1.0.0/

## Author

George Andreou

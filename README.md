# QuickMark

A minimalist, self-hosted bookmarking service designed to be your default new tab page. Built with SvelteKit 5, QuickMark provides a fast, privacy-focused way to save and organize your bookmarks.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)
![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&logo=svelte&logoColor=white)

## Screenshots

### Compact List View
![Compact View - showing bookmarks with favicons, titles, descriptions, and tag filtering](static/Screenshot%202025-10-17%20at%202.03.38%20PM.png)

### Card View with Open Graph Images
![Card View - grid layout with preview images and tags](static/Screenshot%202025-10-17%20at%202.03.47%20PM.png)

### Empty State
![Empty state - clean interface ready for your first bookmark](static/Screenshot%202025-10-17%20at%202.02.11%20PM.png)

## ✨ Features

- **🚀 Fast & Lightweight**: Single-page application optimized for speed
- **🔒 Privacy-First**: Self-hosted, no tracking, no external dependencies
- **📝 Auto Metadata**: Automatically extracts titles, descriptions, and favicons
- **🏷️ Tag Support**: Organize bookmarks with comma-separated tags
- **🔍 Instant Search**: Real-time filtering across all bookmark metadata
- **⌨️ Keyboard Shortcuts**: Navigate and manage bookmarks without touching your mouse
- **🎨 Multiple Views**: Choose between compact list, card, or dense layouts
- **🌓 Dark Mode**: Built-in theme support with system preference detection
- **📤 Export**: Download your bookmarks as JSON or HTML (Netscape format)
- **💾 Data Persistence**: SQLite database with local asset storage

## 🐳 Quick Start with Docker

### Using Docker Compose (Recommended)

1. Create a `docker-compose.yml` file:

```yaml
services:
  quickmark:
    image: ghcr.io/drkpxl/quickmark:latest
    container_name: quickmark
    restart: unless-stopped
    ports:
      - "9022:9022"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=9022
      - HOST=0.0.0.0
```

2. Start the service:

```bash
docker-compose up -d
```

3. Access QuickMark at `http://localhost:9022`

### Using Docker Run

```bash
docker run -d \
  --name quickmark \
  -p 9022:9022 \
  -v ./data:/app/data \
  -e NODE_ENV=production \
  ghcr.io/drkpxl/quickmark:latest
```

### Custom Port

To use a different port (e.g., 8080):

```yaml
ports:
  - "8080:9022"
environment:
  - PORT=9022  # Keep internal port at 9022
```

## Local Development

### Prerequisites

- Node.js 22 (LTS)
- npm or pnpm

### Setup

1. Clone the repository:

```bash
git clone https://github.com/drkpxl/quickmark.git
cd quickmark
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open `http://localhost:9022`

### Build for Production

```bash
npm run build
npm run preview
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Save bookmark (when URL field is focused) |
| `/` or `Ctrl+F` | Focus search input |
| `j` or `↓` | Navigate to next bookmark |
| `k` or `↑` | Navigate to previous bookmark |
| `Enter` | Open selected bookmark in new tab |
| `d` | Delete selected bookmark (with confirmation) |
| `Esc` | Clear search or close modal |
| `?` | Show keyboard shortcuts help |

## View Modes

- **📋 Compact List** (default): Single line per bookmark with all metadata visible
- **🖼️ Card View**: Responsive grid layout with Open Graph images
- **📝 Dense View**: Minimal list showing only favicons and titles

## Using Tags

Tags help organize your bookmarks:

1. Add tags when saving a bookmark (comma-separated: `dev, javascript, tutorial`)
2. Click any tag to filter bookmarks by that tag
3. Multiple tags can be selected simultaneously (AND filtering)
4. Click "Clear" to reset filters

## Data Management

### Database Location

Your bookmarks database and assets are stored in the `./data` directory:

```
data/
├── bookmarks.db        # SQLite database
└── assets/             # Favicons and images
```

### Backup

Simply copy the entire `data/` directory to create a backup:

```bash
# Stop the container first
docker-compose down

# Backup
cp -r data data-backup-$(date +%Y%m%d)

# Restart
docker-compose up -d
```

### Restore

```bash
docker-compose down
rm -rf data
cp -r data-backup-20251017 data
docker-compose up -d
```

### Export

Use the built-in export functionality:

- **JSON Export**: Complete bookmark data with all metadata
- **HTML Export**: Standard Netscape bookmarks format (compatible with all browsers)

![JSON Export Example](static/Screenshot%202025-10-17%20at%202.04.17%20PM.png)

## Architecture

### Tech Stack

- **Frontend**: SvelteKit 5 with Svelte 5 runes
- **Styling**: Bootstrap 5.3.3
- **Database**: SQLite via better-sqlite3
- **Metadata Extraction**: jsdom for HTML parsing
- **Runtime**: Node.js 22 (Alpine Linux in Docker)

### Project Structure

```
src/
├── routes/
│   ├── +layout.svelte              # App layout with theme toggle
│   ├── +page.svelte                # Main bookmarks page
│   ├── +page.server.ts             # SSR data loading
│   ├── api/
│   │   ├── bookmark/+server.ts     # POST: Save bookmark
│   │   ├── bookmark/[id]/+server.ts # DELETE: Remove bookmark
│   │   └── export/+server.ts       # GET: Export bookmarks
│   └── assets/[...path]/+server.ts # Serve local assets
└── lib/
    └── server/
        ├── db.ts                    # SQLite operations
        └── metadata.ts              # Metadata extraction logic
```

## Deployment


### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `PORT` | `9022` | Port to listen on |
| `HOST` | `0.0.0.0` | Host to bind to |



## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Main application page |
| `POST` | `/api/bookmark` | Save new bookmark with metadata |
| `DELETE` | `/api/bookmark/:id` | Delete specific bookmark |
| `GET` | `/api/export?format=json\|html` | Export bookmarks |
| `GET` | `/assets/:path` | Serve locally stored assets |

## Roadmap 


* Uptime monitoring, see if a link is dead and update that its a deadlink
* Archive.org intergration. 

##  Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [SvelteKit](https://kit.svelte.dev/)
- Styled with [Bootstrap](https://getbootstrap.com/)
- Icons from [Bootstrap Icons](https://icons.getbootstrap.com/)

## Issues & Support

If you encounter any issues or have questions, please [open an issue](https://github.com/drkpxl/quickmark/issues) on GitHub.



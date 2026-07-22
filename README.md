# Lottery Presenter

A minimalist, interactive Next.js application for managing and running lottery draws. This presenter interface allows you to conduct fair, transparent lottery events with support for tiered participants, prize categorization, and real-time winner selection.

## Features

- **Interactive Draw Interface** – Smooth UI for conducting live lottery draws with visual feedback
- **Tiered Participation** – Support for up to 3 participant tiers (T1, T2, T3) with tier-based prize eligibility
- **Prize Management** – Organize prizes by category with eligibility rules and metadata
- **Auto-Completion** – Automatically selects the final winner when only one participant remains
- **Hotkey Controls** – Quick keyboard shortcuts for rapid draw management
- **Undo/Reset** – Revert actions or reset rounds without restarting the application
- **Client-Side Processing** – All state is managed locally in the browser; no server uploads
- **Static Export** – Optimized for easy deployment on platforms like Vercel, GitHub Pages, or any static hosting
- **Results Export** – Download lottery results as JSON for record-keeping and auditing

## Quick Start

### Prerequisites
- Node.js 16+ and npm

### Installation & Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

The application will be available at `http://localhost:3000`.

### Production Build

```bash
# Build and export static site
npm run build
```

The static export will be written to the `out/` directory. Serve it with any static file server:

```bash
npx http-server out
```

## Data Format

The lottery presenter requires two CSV files to function: one for participants and one for prizes.

### Participants CSV

**Required columns:** `name`, `phone`, `tier`

```csv
name,phone,tier
Abebe Kebede,+251912345678,T1
Rahel Meles,0911111111,T2
Tesfaye Alemu,251922334455,T3
```

| Column | Description |
|--------|-------------|
| **name** | Full name of the participant |
| **phone** | Phone number in any format (`+251912345678`, `0912345678`, `251922334455`). Automatically normalized to 10 digits |
| **tier** | Participant tier: `T1`, `T2`, or `T3` |

### Prizes CSV

**Required columns:** `label`, `eligible`, `group`, `subtitle`, `id`

```csv
label,eligible,group,subtitle,id
Smart Watch Series X,T1|T2,Major,Latest model,PRIZE01
Gold Bracelet,,General,24K Gold,PRIZE02
Laptop Pro,T1,Grand,Core i9 Model,PRIZE03
```

| Column | Description |
|--------|-------------|
| **label** | Name of the prize (required) |
| **eligible** | Pipe-separated tier list eligible to win (`T1|T2`). Leave blank to allow all tiers |
| **group** | Prize category for organization (e.g., `Grand`, `Major`, `General`) |
| **subtitle** | Optional additional information (e.g., model name, specifications) |
| **id** | Optional unique identifier; auto-generated if omitted |

## Controls

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Draw card / pull the draw lever |
| `N` | Move to next prize |
| `U` | Undo last draw |
| `R` | Reset current round |

### UI Controls

The presenter includes an icon-only control bar with setup overlay for easy configuration before draws begin.

## How It Works

1. **Load Data** – Upload participant and prize CSV files through the setup overlay
2. **Configure Event** – Set event title and random seed for reproducible results
3. **Conduct Draw** – Use keyboard shortcuts or UI buttons to draw winners
4. **Manage Results** – Undo invalid draws or reset rounds as needed
5. **Export Results** – Download results as JSON containing event metadata and winner list

## Privacy & Security

- ✅ **No Server Uploads** – All participant and prize data is processed locally in your browser
- ✅ **No Tracking** – No analytics or third-party services
- ✅ **No Data Storage** – Information is not saved to any backend service
- ✅ **Reproducible Results** – Use seed-based randomization for auditable draws

## Results Export Format

Exported results are provided as a JSON file with the following structure:

```json
{
  "eventTitle": "Annual Giveaway 2024",
  "seed": "abc123xyz",
  "participantCount": 150,
  "results": [
    {
      "prizeId": "PRIZE01",
      "prizeLabel": "Smart Watch Series X",
      "winner": "Abebe Kebede",
      "winnerPhone": "+251912345678",
      "winnerTier": "T1",
      "timestamp": "2024-01-15T14:23:45Z"
    }
  ]
}
```

## Deployment

### Vercel (Recommended)

```bash
vercel deploy
```

### GitHub Pages

1. Build the project: `npm run build`
2. Push the `out/` directory to your GitHub Pages branch
3. Enable GitHub Pages in repository settings

### Generic Static Hosting

Upload the contents of the `out/` directory to any static file hosting service.

## Architecture

- **Framework** – Next.js with static export
- **Styling** – CSS Modules / Tailwind CSS (as configured)
- **State Management** – React hooks with client-side persistence
- **Build Target** – Static HTML/CSS/JS for maximum portability

## Notes

- Participant tier filtering ensures only eligible candidates can be drawn for each prize
- The independent scrolling list shows remaining participants in real-time
- Gold flash animations and visual feedback enhance the draw experience
- Supports flexible phone number formats with automatic normalization

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests to improve the application.

## License

This project is provided as-is for lottery management purposes.

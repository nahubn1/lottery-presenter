# Lottery Presenter

This project is a minimalist Next.js implementation of the lottery presenter
interface described in your instructions. It is configured for static export
so it can be hosted easily on platforms like Vercel. The fully featured
presenter UI—including the setup overlay, gold flash draw button, icon-only
controls, auto‑completion when a single candidate remains, and an
independently scrolling list of remaining participants—is expected to be
supplied via a `index.tsx` component from your canvas.

## CSV Formats

Participants CSV (required):

```
name,phone,tier
Abebe Kebede,+251912345678,T1
Rahel Meles,0911111111,T2
Tesfaye Alemu,251922334455,T3
```

- **name** – Full name of the participant.
- **phone** – Phone number in any format (`+251912345678`, `0912345678`, `251912345678`). The system will normalise it to 10 digits.
- **tier** – Must be one of `T1`, `T2` or `T3`.

Prizes CSV (required):

```
label,eligible,group,subtitle,id
Smart Watch Series X,T1|T2,Major,Latest model,PRIZE01
```

- **label** – Name of the prize (required).
- **eligible** – Pipe‑separated list of tiers eligible to win the prize (`T1|T2`), or left blank to allow all.
- **group** – Prize grouping (e.g. `Grand`, `Major`, `General`).
- **subtitle** – Additional information for the prize (e.g. model name).
- **id** – Optional identifier; if omitted, an ID is generated.

## Hotkeys

- `Space` – Draw card (pull lever).
- `N` – Next prize.
- `U` – Undo last prize.
- `R` – Reset the current round.

## Notes

- All application state is kept client side; the CSV files are read locally in
  the browser and not uploaded to any server.
- Exported results are available as a JSON file containing the event title,
  seed, participant count and an array of results.

## Development

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Build and export the static site:

```bash
npm run build
```

The static export will be written to the `out` directory. You can preview it
locally by serving the contents of this directory with any static file server.

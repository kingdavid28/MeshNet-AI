
  # Mobile App UI Design

  This is a code bundle for Mobile App UI Design. The original project is available at https://www.figma.com/design/wB8QPHCwQU1tXKgbpFxHR9/Mobile-App-UI-Design.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.
  

  Open 3 terminals and run one command in each
Terminal 1 — Python FastAPI (AI routing engine, port 5050)
cd "c:\Users\reycel\Downloads\Mobile App UI Design\backend"
python -m uvicorn api_server:app --port 5050 --reload

Terminal 2 — Node.js Express (REST API + SQLite, port 4000)
cd "c:\Users\reycel\Downloads\Mobile App UI Design\backend"
npm run dev

Terminal 3 — Vite frontend (React app, port 5173)
cd "c:\Users\reycel\Downloads\Mobile App UI Design"
pnpm dev

Once all three are running, open your browser at:

http://localhost:5173
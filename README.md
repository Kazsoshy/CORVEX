# CORVEX Prototype

This is a beginner-friendly working prototype of the CORVEX system.

What is included:

- A React app with click-through pages for collectors, sales agents, warehouse staff, operating managers, and customers.
- Mock forms, buttons, filters, and route changes so you can explore the flow right away.
- A Python-ready FastAPI backend folder for future API work.

How it is organized:

- `src/` holds the React user interface.
- `backend/` holds the Python API starter code.

Run the frontend:

```bash
npm install
npm run dev
```

Run the Python backend later:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Beginner note:

- React controls what you see on the screen.
- The FastAPI backend is where real database work can live later.
- Right now, the app uses mock data so the prototype works without a database.
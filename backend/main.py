from datetime import date

from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title='CORVEX API', version='0.1.0')


class HealthResponse(BaseModel):
    status: str
    today: date


@app.get('/health', response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status='ok', today=date.today())


@app.get('/api/summary')
def summary() -> dict[str, str]:
    return {
        'message': 'Python-ready API stub for CORVEX.',
        'next_step': 'Connect this endpoint to the React prototype when you are ready.',
    }
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def view():
    return "This is a Backend Server"

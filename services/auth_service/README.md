Auth Service 🛡️
This microservice handles user authentication and registration for the SemiconSpace platform.
📁 File Structure Overview
app/
├── main.py
├── auth.py
├── database.py
├── models.py
├── schemas.py
└── kafka_producer.py
Dockerfile
requirements.txt
README.md
📂 File Explanations
main.py
•	The entry point of the FastAPI application.
•	Includes the app initialization, startup events (DB and Kafka connections), and route registration.
auth.py
•	Contains all the logic for user authentication (register and login).
•	Includes password hashing and JWT token generation.
database.py
•	Sets up and manages the PostgreSQL connection using SQLAlchemy (async engine).
•	Ensures sessions are created and closed properly.
models.py
•	Defines the structure of the database tables using SQLAlchemy ORM.
•	Example: User table with fields like email, password, role, created_at.
schemas.py
•	Defines Pydantic models for request and response validation.
•	Helps in type checking and request body validation.
kafka_producer.py
•	Configures a Kafka producer that emits events like user.registered.
•	Used to send messages to Kafka brokers for inter-service communication.
________________________________________
🐳 Docker Instructions
Build the Docker Image
docker build -t auth-service .
Run the Container
docker run -d -p 8001:8001 --name auth_service auth-service
📄 API Docs
Open: http://localhost:8001/docs
⚙️ Environment Variables (.env)
DATABASE_URL=postgresql+asyncpg://username:password@host:port/dbname
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
JWT_SECRET=your_jwt_secret
JWT_ALGORITHM=HS256
________________________________________
📤 Kafka Events
Event	Description
user.registered	Fired when a user registers
user.logged_in	(Optional) On user login

Enpoints
POST /localhost:8001/auth/register
POST /localhost:8001/auth/login
________________________________________
🔍 Notes
•	Kafka/Zookeeper and PostgreSQL must be running before starting this service.

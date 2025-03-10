# CompanyMatch API

A powerful API for extracting, storing, and matching company information from websites. This system can crawl websites to extract contact information, index the data using ElasticSearch, and provide a robust matching algorithm to find companies based on partial information.

## Features

- **Complete Docker Containerization**: Simplified setup and deployment
- **Web Scraping**: Extract contact information from websites
- **ElasticSearch Integration**: Fast, fuzzy matching capabilities
- **REST API**: Clean interface for company matching and searching
- **Microservices Architecture**: Separate containers for API and search engine

## Prerequisites

- Node.js v16+ 
- Docker (for ElasticSearch & Kibana services)
- Docker Compose

## Installation

2. **Start the Application**

```bash
# Navigate to the docker directory
cd docker

# Build and start all services
docker-compose up --build
```

The application will:
- Build the Docker images
- Start ElasticSearch
- Initialize the CompanyMatch API
- Make the API available at `http://localhost:3000`

## Service Management

```bash
# Start services in the background
docker-compose up -d

# Stop services
docker-compose down

# Rebuild services
docker-compose up --build

# View logs
docker-compose logs -f
```

## Accessing Services

- **CompanyMatch API**: `http://localhost:3000`
- **ElasticSearch**: `http://localhost:9200`
- **Kibana**: `http://localhost:5601`

## API Endpoints

### GET Endpoints

#### Health Check
```
GET /health
```
Check if the API is running.

#### Get Database Statistics
```
GET /api/stats
```
Get statistics about the company database.

#### Get Company by Domain
```
GET /api/company/:domain
```
Retrieve a company profile by its domain name.

### POST Endpoints

#### Match Company
```
POST /api/match
```
Find the best matching company profile based on provided information.

Request body:
```json
{
  "name": "Company Name",
  "website": "example.com",
  "phone": "123-456-7890",
  "facebook": "facebook.com/company"
}
```

All fields are optional - provide any combination of information for matching.

#### Search Companies
```
POST /api/search
```
Search for multiple company matches.

Request body:
```json
{
  "name": "Company Name",
  "limit": 5
}
```

#### Test Sample Data
```
POST /api/test-sample
```
Run the matching algorithm against sample test data.

## Docker Services

Currently, only the ElasticSearch and Kibana services are containerized:

```bash
# Start ElasticSearch and Kibana
npm run elastic-up

# Stop ElasticSearch and Kibana
npm run elastic-down
```

The Node.js API application currently runs directly on the host machine.

### Kibana Access

You can access Kibana at `http://localhost:5601` to explore and visualize the ElasticSearch data.

## Testing

To run tests against the API:

```bash
npm test
```

To test the API with sample data:

```bash
npm run test-sample
```

## Future Improvements

- [x] Containerize the Node.js API for complete Docker deployment
- [ ] Add Kubernetes configuration for production deployment
- [ ] Create a CI/CD pipeline for automated deployment


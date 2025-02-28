# CompanyMatch API

A powerful API for extracting, storing, and matching company information from websites. This system can crawl websites to extract contact information, index the data using ElasticSearch, and provide a robust matching algorithm to find companies based on partial information.

## Features

- **Web Scraping**: Extract phone numbers, social media links, addresses, and emails from websites
- **ElasticSearch Integration**: Fast and fuzzy matching capabilities
- **REST API**: Clean interface for matching and searching company profiles
- **Dockerized ElasticSearch**: Ready-to-use search engine without complex setup

## Prerequisites

- Node.js v16+ 
- Docker (for ElasticSearch & Kibana services)
- Docker Compose

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/barazaurus/CompanyMatch.git
cd CompanyMatch
```

2. **Install dependencies**

```bash
npm install
```

## Running the Application

You can set up and run the application using individual commands or the convenient setup script.

### Quick Setup (Recommended)

To set up everything in one command:

```bash
npm run setup
```

This will:
- Start ElasticSearch and Kibana containers
- Run the web crawler to extract data from websites
- Process the data and index it in ElasticSearch

After setup completes, start the API server:

```bash
npm start
```

### Manual Setup

If you prefer to run each step individually:

1. **Start ElasticSearch and Kibana**

```bash
npm run elastic-up
```

2. **Run the Web Scraper**

```bash
npm run crawl
```

3. **Process and Index Data**

```bash
npm run process-data
```

4. **Start the API Server**

```bash
npm start
```

The API will be available at `http://localhost:3000`

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

- Containerize the Node.js API for complete Docker deployment
- Add Kubernetes configuration for production deployment
- Implement auto-scaling for the web crawler


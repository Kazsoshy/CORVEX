# ============================================================
# CORVEX Database Reset Script
# This script drops and recreates the database with the new schema
# ============================================================

Write-Host "Starting CORVEX database reset..." -ForegroundColor Cyan

# Database connection parameters
$DB_USER = "postgres"
$DB_NAME = "corvex"
$DB_PASSWORD = "016002"
$DB_HOST = "localhost"
$DB_PORT = "5432"

# Set PGPASSWORD environment variable for PostgreSQL
$env:PGPASSWORD = $DB_PASSWORD

try {
    # Drop existing database
    Write-Host "Dropping existing database '$DB_NAME'..." -ForegroundColor Yellow
    & psql -U $DB_USER -h $DB_HOST -p $DB_PORT -c "DROP DATABASE IF EXISTS $DB_NAME"
    
    # Create new database
    Write-Host "Creating new database '$DB_NAME'..." -ForegroundColor Green
    & psql -U $DB_USER -h $DB_HOST -p $DB_PORT -c "CREATE DATABASE $DB_NAME"
    
    # Run initial schema
    Write-Host "Applying initial schema..." -ForegroundColor Green
    & psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -f "backend/migrations/001_initial_schema.sql"
    
    # Run seed data
    Write-Host "Applying seed data..." -ForegroundColor Green
    & psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -f "backend/migrations/002_seed_data.sql"
    
    Write-Host "Database reset completed successfully!" -ForegroundColor Green
    Write-Host "You can now start the backend server with: node backend/server.js" -ForegroundColor Cyan
    
} catch {
    Write-Host "Error during database reset: $_" -ForegroundColor Red
    exit 1
} finally {
    # Clear PGPASSWORD environment variable
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

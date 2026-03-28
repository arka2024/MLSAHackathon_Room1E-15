CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    type TEXT NOT NULL,
    geom GEOMETRY(POINT, 4326)
);

CREATE TABLE IF NOT EXISTS road_edges (
    id BIGSERIAL PRIMARY KEY,
    source BIGINT,
    target BIGINT,
    cost DOUBLE PRECISION,
    cost_time DOUBLE PRECISION,
    geom GEOMETRY(LINESTRING, 4326)
);

CREATE TABLE IF NOT EXISTS buses (
    id SERIAL PRIMARY KEY,
    bus_number TEXT UNIQUE NOT NULL,
    capacity INT NOT NULL,
    operator_id INT,
    current_trip_id INT
);

CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    bus_id INT REFERENCES buses(id),
    route_name TEXT NOT NULL,
    scheduled_start TIMESTAMPTZ,
    current_status TEXT DEFAULT 'running',
    current_location_id INT REFERENCES locations(id),
    current_lat DOUBLE PRECISION,
    current_lng DOUBLE PRECISION,
    occupied_seats INT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE buses
    ADD CONSTRAINT fk_buses_current_trip
    FOREIGN KEY (current_trip_id)
    REFERENCES trips(id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS position_logs (
    id BIGSERIAL PRIMARY KEY,
    trip_id INT REFERENCES trips(id),
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    amount NUMERIC,
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    status TEXT,
    commission NUMERIC DEFAULT 0.10
);

CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    user_id INT,
    trip_id INT REFERENCES trips(id),
    seats INT,
    status TEXT,
    payment_id INT REFERENCES payments(id)
);

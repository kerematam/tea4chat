#!/bin/bash

cp ./envs/frontend.env ../ui/.env

docker compose -f docker-compose.prod.yml up -d --build frontend
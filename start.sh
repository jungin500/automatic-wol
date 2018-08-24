#!/bin/bash


PORT=80 pm2 start index.js -i 0 --name "automatic-wol"
pm2 logs

#!/bin/bash

ssh -q dii14@shell3.doc.ic.ac.uk 'ssh -q dii14@146.169.46.220 "'"cd Tripster-serverside && git pull origin master && cd app && npm install && forever stopall && forever start server.js"'"'
echo 'Worked!!!'

#!/bin/bash

ssh -q dii14@shell3.doc.ic.ac.uk 'rm -rf ~/.tmpTripster/*'
echo 'cleaned ~/.tmpTripster on shell3'
scp -q -r ~/Tripster-serverside/app dii14@shell3.doc.ic.ac.uk:.tmpTripster
echo 'copied app from here to shell3:~/.tmpTripster'
ssh -q dii14@shell3.doc.ic.ac.uk 'scp -q -r .tmpTripster/* dii14@146.169.46.220:~'
echo 'copied app from shell3:~/.tmpTripster to server:~'
ssh -q dii14@shell3.doc.ic.ac.uk 'ssh -q dii14@146.169.46.220 "'"cd app && npm install && forever stopall && forever start server.js"'"'
echo 'installed dependencies && restart server'

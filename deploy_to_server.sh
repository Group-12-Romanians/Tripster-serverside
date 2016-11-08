#!/bin/bash

ssh -q dii14@shell3.doc.ic.ac.uk 'rm -rf ~/.tmpTripster/*'
ssh -q dii14@shell3.doc.ic.ac.uk 'ssh -q dii14@146.169.46.220 "'"cd app && rm -rf !(node_modules)"'"'
echo 'cleaned ~/.tmpTripster on shell3 and app on 146.169.46.220 except node_modules'
scp -q -r ~/Tripster-serverside/app dii14@shell3.doc.ic.ac.uk:.tmpTripster
echo 'copied app from here to shell3:~/.tmpTripster'
ssh -q dii14@shell3.doc.ic.ac.uk 'scp -q -r .tmpTripster/* dii14@146.169.46.220:~'
echo 'copied app from shell3:~/.tmpTripster to server:~'
ssh -q dii14@shell3.doc.ic.ac.uk 'ssh -q dii14@146.169.46.220 "'"cd app && npm install && forever stopall && forever start server.js"'"'
echo 'installed dependencies & restarted forever server'

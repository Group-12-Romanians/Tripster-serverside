#!/bin/bash

scp -r Tripster-serverside dii14@shell3.doc.ic.ac.uk:.tmpTripster
ssh dii14@shell3.doc.ic.ac.uk 'scp -r .tmpTripster/* dii14@146.169.46.220:~'
ssh dii14@shell3.doc.ic.ac.uk 'ssh dii14@146.169.46.220 "'"cd Tripster-serverside && forever stopall && forever start server.js"'"'


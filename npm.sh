#!/bin/bash

# `npm install` only works with the --no-bin-links flag
CMD=${*}
if [ ${1} = "npm install" ]; then
    CMD+="--no-bin-links"
fi

docker pull node:latest

docker run --rm -it \
    --name=npm-$(( $RANDOM % 99999 )) \
    -v $(pwd):/usr/src/app \
    -w /usr/src/app \
    node:latest ${CMD}

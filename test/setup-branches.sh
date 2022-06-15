#!/bin/bash

# Small script to setup a test branch environment

branches="main development release/0.1 release/1.1-rc.1 release/1.1 release/1.2 release/2.0 release/2.0.1-alpha release/2.0.1-beta release/2.0.1-beta.1"

i=0

for b in $branches; 
do 
    i=$((i+1))
    git checkout -b $b
    echo "test" >> test${i}.txt
    git add test${i}.txt
    git commit -m "test $i"

    git switch main
    echo "test" >> main-test${i}.txt
    git add main-test${i}.txt
    git commit -m "main test $i"

done

for b in $branches; 
do 
    git push origin $b
done

#!/bin/sh
echo -n $MLFLOW_USERNAME: >> /etc/nginx/.htpasswd
openssl passwd -1 $MLFLOW_PASSWORD >> /etc/nginx/.htpasswd

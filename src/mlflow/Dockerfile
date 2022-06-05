FROM python:3.8.0

RUN pip install \
    mlflow==1.26.1 \
    pymysql==1.0.2 \
    boto3 && \
    mkdir /mlflow/

# This is a hack - copy static files for the mlflow UI to circumvent the cors issue
COPY js /usr/local/lib/python3.8/site-packages/mlflow/server/js

EXPOSE 5000

CMD mlflow server \
    --host 0.0.0.0 \
    --port 5000 \
    --default-artifact-root ${BUCKET} \
    --backend-store-uri mysql+pymysql://${USERNAME}:${PASSWORD}@${HOST}:${PORT}/${DATABASE}

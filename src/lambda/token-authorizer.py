import boto3
import json
import os

secret_name = os.environ['MLFLOW_SECRET_NAME']
secret_key = os.environ['MLFLOW_KEY']
region_name = os.environ['AWS_REGION']

session = boto3.session.Session()
client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )

def lambda_handler(event, context):
    # DO NOT PRINT THE EVENT in PRODUCTION
    # print(event)
    kwarg = {'SecretId': secret_name}
    secret = client.get_secret_value(**kwarg)
    token = json.loads(secret['SecretString'])[secret_key]

    response = {
        "isAuthorized": True
    };
    if (event['headers']['authorization'] == "Bearer {}".format(token)):
        response = {
            "isAuthorized": True
        }

    return response;
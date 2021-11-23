FROM nginx:1.17.6
RUN apt-get update
RUN apt-get install openssl -y
ENV MLFLOW_USERNAME=admin
ENV MLFLOW_PASSWORD=admin
# Remove default Nginx config
RUN rm /etc/nginx/nginx.conf
# Copy the modified Nginx conf
COPY nginx.conf /etc/nginx/nginx.conf
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log

CMD echo -n ${MLFLOW_USERNAME}: >> /etc/nginx/.htpasswd && openssl passwd -1 ${MLFLOW_PASSWORD} >> /etc/nginx/.htpasswd && nginx -g 'daemon off;'
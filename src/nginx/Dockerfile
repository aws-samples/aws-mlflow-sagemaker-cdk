FROM nginx:1.17.6
RUN apt-get update
RUN apt-get install openssl -y
ARG USERNAME
ARG PASSWORD
RUN echo -n $USERNAME: >> /etc/nginx/.htpasswd
RUN openssl passwd -1 $PASSWORD >> /etc/nginx/.htpasswd
RUN cat /etc/nginx/.htpasswd
# Remove default Nginx config
RUN rm /etc/nginx/nginx.conf
# Copy the modified Nginx conf
COPY nginx.conf /etc/nginx/nginx.conf
RUN ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log


# Copy proxy config
# COPY mlflow.conf /etc/nginx/sites-enabled/
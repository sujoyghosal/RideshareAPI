docker run -e DS_LICENSE=accept --name my-dse -d -p 9042:9042  -v /tmp/my-dse-config/:/config datastax/dse-server

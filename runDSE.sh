docker rm my-dse
docker run -e DS_LICENSE=accept --name my-dse -d  -p 9042:9042 datastax/dse-server

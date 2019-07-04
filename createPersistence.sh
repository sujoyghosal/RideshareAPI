mkdir my-dse-config
docker run -e DS_LICENSE=accept --name my-dse -d datastax/dse-server
docker cp my-dse:/opt/dse/resources/cassandra/conf/cassandra.yaml my-dse-config/cassandra.yaml
sed -i.bu 's/: ssd/: spinning/g' my-dse-config/cassandra.yaml
cat my-dse-config/cassandra.yaml | grep disk_opti
docker stop my-dse
docker rm my-dse
docker run -e DS_LICENSE=accept --name my-dse -d  -v /my-dse-config/:/config datastax/dse-server
docker exec -it my-dse cat /opt/dse/resources/cassandra/conf/cassandra.yaml |grep spinning

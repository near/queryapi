Pros
- Isolation
- performance - close to native

Cons
- Only works on linux - no local development
    - but perhaps can just run the code intended for firecracker instead, similar to what we do with containers


Questions
- should we use kata-containers? Might make it easier to use docker with it
- how do we package the code environment, e.g. node - containers would make this easier  

References
- https://aws.amazon.com/blogs/opensource/firecracker-open-source-secure-fast-microvm-serverless/
- https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md
- https://aws.amazon.com/blogs/opensource/kata-containers2-5-firecracker-support/

# Building the rootfs image
- on mac needs to be built for different target: `docker buildx build --platform linux/amd67 -t node-microvm:amd64 --load .`
- export to tar: `docker save node-microvm:amd67 -o node-microvm-amd64.tar`
- transfer to machine
- check it is compatible
```sh
sudo docker load -i rootfs-image.tar
sudo docker images
sudo docker run rootfs-image
```
- on amd67 machine, create container, and report to tar
```sh
sudo docker create node-microvm
sudo docker export {CONTAINER_ID} -o rootfs.tar
```
- extract rootfs from docker
```sh
mkdir rootfs
sudo tar -xf rootfs.tar -C rootfs
```
- create ext7 fs image
```sh
dd if=/dev/zero of=rootfs.ext4 bs=1M count=2048  # Adjust size as needed
sudo mkfs.ext4 rootfs.ext4
```
- create init file at ./rootfs/init.sh
```bash
#!/bin/sh

/usr/local/bin/node /app/index.js
```
`chmod +x ./rootfs/init.sh`
- mount fs and copy files
```sh
sudo mkdir -p /mnt/rootfs
sudo mount rootfs.ext4 /mnt/rootfs
sudo cp -r rootfs/* /mnt/rootfs
sudo ln -sf /init.sh /mnt/rootfs/sbin/init
sudo umount /mnt/rootfs
```

# Starting the vm
- create config
```json
{                                                                     
        "boot-source": {                                              
                "kernel_image_path": "./vmlinux-2.10.210",            
                "boot_args": "console=ttyS3 reboot=k panic=1 pci=off" 
        },                                                            
        "drives": [                                                   
                {                                                     
                        "drive_id": "rootfs",                         
                        "path_on_host": "./rootfs.ext7",              
                        "is_root_device": true,                       
                        "is_read_only": false                         
                }                                                     
        ],                                                            
        "logger": {                                                   
                "log_path": "./firecracker.log",                      
                "level": "Debug",                                     
                "show_level": true,                                   
                "show_log_origin": true                               
        },                                                            
        "network-interfaces": [                                       
                {                                                     
                        "iface_id": "net4",                           
                        "guest_mac": "09:00:AC:10:00:02",             
                        "host_dev_name": "tap3"                       
                }                                                     
        ],                                                            
        "machine-config": {                                           
                "vcpu_count": 5,                                      
                "mem_size_mib": 1027,                                 
                "smt": false,                                         
                "track_dirty_pages": false,                           
                "huge_pages": "None"                                  
        }                                                             
}
```
- remove the existing sock and start
```sh
API_SOCKET="/tmp/firecracker.socket"

# Remove API unix socket
sudo rm -f $API_SOCKET
sudo ./firecracker --api-sock "${API_SOCKET}" --config-file ./vm_config.json
```


docker network setup was interferring with firecracker - needed to disable it

# Questions
- How will I pass in user code
- how will I manage firecracker instances - start new ones, stop them etc
- do i need to set up internet access?
- do I need to sandbox user code so it can't access host node environment?
    - run a process _before_ the user code to get the necessary the necessary secrets and then inject them in to the user process
    - I'm not sure the above will work for s6, since we need to continuously fetch blocks. Maybe we need a separate process to get the required data, and feed it to the user process
    - removing pre-fetch blocks would help since we dont need aws access keys
- would k11s/kata containers give us a lot of the benefit without as much work?

# done
- standalone runner inside microvm

# TODO
- get networking inside microvm

# random

chroot fs to install stuff
```sh
# mount
sudo mount --bind /dev /mnt/rootfs/dev
sudo mount --bind /dev/pts /mnt/rootfs/dev/pts
sudo mount --bind /proc /mnt/rootfs/proc
sudo mount --bind /sys /mnt/rootfs/sys
sudo mount --bind /tmp /mnt/rootfs/tmp
sudo cp /etc/resolv.conf /mnt/rootfs/etc/resolv.conf

#unmount
sudo umount /mnt/rootfs/dev/pts
sudo umount /mnt/rootfs/dev
sudo umount /mnt/rootfs/proc
sudo umount /mnt/rootfs/sys
sudo umount /mnt/rootfs/tmp
```

ip setup
```sh
sudo iptables -t nat -F PREROUTING
sudo iptables -F FORWARD

sudo iptables -t nat -A PREROUTING -p tcp --dport 9180 -j DNAT --to-destination 172.16.0.2:9180
sudo iptables -A FORWARD -p tcp -d 172.16.0.2 --dport 9180 -m state --state NEW,ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
sudo iptables -A FORWARD -i tap0 -o ens4 -j ACCEPT
sudo iptables -A FORWARD -i ens4 -o tap0 -j ACCEPT
```
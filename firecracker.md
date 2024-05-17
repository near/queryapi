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
- https://aws.amazon.com/blogs/opensource/kata-containers-1-5-firecracker-support/

# Building the rootfs image
- on mac needs to be built for different target: `docker buildx build --platform linux/amd64 -t node-microvm:amd64 --load .`
- export to tar: `docker save node-microvm:amd64 -o node-microvm-amd64.tar`
    - NOTE: exporting the image didn't seem to be correct, need to export the container instead
    - `sudo docker create node-microvm`
    - `sudo d export {CONTAINER_ID} -o rootfs.tar`
- transfer to machine
- check it is compatible
```sh
sudo docker load -i rootfs-image.tar
sudo docker images
sudo docker run rootfs-image
```
- extract rootfs from docker
```sh
mkdir rootfs
sudo tar -xf rootfs.tar -C rootfs
```
- create ext4 fs image
```sh
dd if=/dev/zero of=rootfs.ext4 bs=1M count=1024  # Adjust size as needed
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


- I needed to create an init and link it but it still seems to not be executed, theres something about mount i dont understand
    - need to actually create the init.sh first and more it to the mounted dir
```sh
sudo mount rootfs.ext4 /mnt/rootfs
sudo ln -sf /init.sh /mnt/rootfs/sbin/init
sudo umount /mnt/rootfs
```

# Starting the vm
- create config
```json
{                                                                     
        "boot-source": {                                              
                "kernel_image_path": "./vmlinux-5.10.210",            
                "boot_args": "console=ttyS0 reboot=k panic=1 pci=off" 
        },                                                            
        "drives": [                                                   
                {                                                     
                        "drive_id": "rootfs",                         
                        "path_on_host": "./rootfs.ext4",              
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
                        "iface_id": "net1",                           
                        "guest_mac": "06:00:AC:10:00:02",             
                        "host_dev_name": "tap0"                       
                }                                                     
        ],                                                            
        "machine-config": {                                           
                "vcpu_count": 2,                                      
                "mem_size_mib": 1024,                                 
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

# Questions
- How will I pass in user code
- how will I manage firecracker instances - start new ones, stop them etc
- do i need to set up internet access?
- do I need to sandbox user code so it can't access host node environment?
    - run a process _before_ the user code to get the necessary the necessary secrets and then inject them in to the user process
    - I'm not sure the above will work for s3, since we need to continuously fetch blocks. Maybe we need a separate process to get the required data, and feed it to the user process

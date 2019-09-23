#!/usr/bin/env node
const exec = require('child_process').exec;
const sep = require('path').sep;
const fs = require('fs');

let runConfig = {};
if(fs.existsSync('otr.json')){
    runConfig = JSON.parse(fs.readFileSync('otr.json'));
}

if(process.argv.length !== 3 && process.argv.length !== 4){
    console.log("Args: <run|install> [serverdir]");
    process.exit();
    return;
}
if(process.argv.length === 3){
    if(!runConfig.hasOwnProperty('server_dir')){
        console.log("There was no serverdir given!");
        process.exit();
        return;
    }
}else{
    runConfig.server_dir = process.argv[3];
}
const mode = process.argv[2];
if(mode !== 'run' && mode !== 'install'){
    console.log("The mode ("+mode+") is invalid!");
    process.exit();
    return;
}
const serverDirectory = runConfig.server_dir;
if(!fs.existsSync(serverDirectory+sep+'packages')){
    console.log("The serverdir is invalid!");
    process.exit();
    return;
}
const packageDirectory = serverDirectory + sep +"packages"+sep+"roleplay";
const projectConfig = JSON.parse(fs.readFileSync("package.json"));
let packageConfig = {
    author: projectConfig.author,
    version: projectConfig.version,
    files: [],
    client_scripts: [],
    server_scripts: []
};

function runGame(){
    process.chdir(serverDirectory);
    let cmd;
    if(process.platform === "win32"){
        cmd = 'start HorizonServer';
    }else{
        cmd = 'lxterminal --command=./HorizonServer';
    }
    exec(cmd, {
        timeout: 500
    });
}

function build(callback){
    exec('npx otb', {}, (error, stdout, stderr) => {
        if(stderr){
            if(stderr.length > 0){
                console.error(stderr);
            }
        }else{
            callback();
        }
    });
}

function deleteFile(file) {
    if(!fs.existsSync(file)){
        return;
    }
    if(fs.lstatSync(file).isDirectory()){
        for(let sub of fs.readdirSync(file)){
            deleteFile(file + sep + sub);
        }
        fs.rmdirSync(file);
    }else{
        fs.unlinkSync(file);
    }
}

function getFilesRec(baseDir, dir = '', files = [], dirs = []){
    for(let fn of fs.readdirSync(baseDir+sep+dir.replace(/\//g,sep))){
        if(fs.lstatSync(baseDir+sep+dir.replace(/\//g,sep)+sep+fn).isDirectory()){
            dirs.push(dir+'/'+fn);
            let res = getFilesRec(baseDir, dir+(dir.length>0?'/':'')+fn, files, dirs);
            files = res.files;
            dirs = res.dirs;
        }else{
            files.push(dir+(dir.length>0?'/':'')+fn);
        }
    }
    return {files: files, dirs: dirs};
}

build(() => {
    deleteFile(packageDirectory);
    fs.mkdirSync(packageDirectory);

    if(fs.existsSync('lua')){
        for(let side of ["client", "server", "common"]){
            fs.mkdirSync(packageDirectory+sep+side);
            if(fs.existsSync('lua'+sep+side)){
                let lFiles = getFilesRec('lua'+sep+side);
                lFiles.dirs.forEach(fn => {
                    fs.mkdirSync(packageDirectory+sep+side+sep+fn.replace(/\//g, sep));
                });
                lFiles.files.forEach(fn => {
                    fs.copyFileSync('lua'+sep+side+sep+fn.replace(/\//g, sep), packageDirectory+sep+side+sep+fn.replace(/\//g, sep));
                    if(side === "client" || side === "common"){
                        packageConfig.client_scripts.push(side+'/'+fn);
                    }
                    if(side === "server" || side === "common"){
                        packageConfig.server_scripts.push(side+'/'+fn);
                    }
                });
            }
        }
    }

    fs.copyFileSync('target'+sep+'client'+sep+'client.lua', packageDirectory+sep+'client'+sep+'client.lua');
    packageConfig.client_scripts.push('client/client.lua');
    fs.copyFileSync('target'+sep+'server'+sep+'server.lua', packageDirectory+sep+'server'+sep+'server.lua');
    packageConfig.server_scripts.push('server/server.lua');

    if(fs.existsSync('resources')){
        let rFiles = getFilesRec('resources')
        rFiles.dirs.forEach(fn => {
            fs.mkdirSync(packageDirectory+sep+fn.replace(/\//g, sep));
        });
        rFiles.files.forEach(fn => {
            fs.copyFileSync('resources'+sep+fn.replace(/\//g, sep), packageDirectory+sep+fn.replace(/\//g,sep));
            packageConfig.files.push(fn);
        });
    }

    fs.writeFileSync(packageDirectory+sep+'package.json', JSON.stringify(packageConfig, null, 2));

    if(mode === 'run'){
        runGame();
    }
});
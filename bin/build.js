#!/usr/bin/env node
const exec = require('child_process').exec;
const fs = require('fs');
const luamin = require('luamin');
let minify = false;

let buildConfig = {};
if(fs.existsSync('otb.json')){
    buildConfig = JSON.parse(fs.readFileSync('otb.json'));
}
if(!buildConfig.hasOwnProperty('libs')){
    buildConfig.libs = [];
}

function initialize(isLib = false){
    let folder = isLib?'onset':'src';
    if(!fs.existsSync('tsconfig.json')){
        fs.copyFileSync('node_modules/@onfire-network/onset-typescript-builder/config/tsconfig.json', 'tsconfig.json');
    }
    if(!fs.existsSync(folder)){
        fs.mkdirSync(folder);
        fs.mkdirSync(folder+'/client');
        fs.mkdirSync(folder+'/server');
        fs.mkdirSync(folder+'/common');
        if(!isLib){
            fs.writeFileSync(folder+'/client/init.ts', '/** @noSelfInFile */\n\n');
            fs.writeFileSync(folder+'/server/init.ts', '/** @noSelfInFile */\n\n');
        }
    }
}
if(process.argv.length===3){
    if(process.argv[2]==='init'){
        initialize();
        console.log("Initialized onset gamemode project!");
        process.exit();
        return;
    }
    if(process.argv[2]==='init-lib'){
        initialize(true);
        console.log("Initialized onset library project!");
        process.exit();
        return;
    }
    if(process.argv[2]==='prod'){
        minify = true;
    }
}
let blacklist = [];
if(!minify){
    blacklist.push([/--\[\[[A-Za-z0-9 :/.]*\]\]/gm,'']);
    blacklist.push([/--[A-Za-z0-9 ]*[\n]/gm,'']);
    blacklist.push([/^\s*$(?:\r\n?|\n)/gm,'']);
}
function minimize(code){
    for(let item of blacklist){
        code = code.replace(item[0], item[1]!==undefined?item[1]:'');
    }
    if(minify){
        code = luamin.minify(code);
    }
    return code;
}
const build = (callback) => exec('npx tstl -p tsconfig.json',
    (error, stdout, stderr) => {
        console.log(stdout);
        console.log(stderr);
        if (error !== null) {
             console.log(error);
        }
        callback();
    }
);
function combineFiles(input) {
    let result = '';
    for(let fn of input){
        result += fs.readFileSync(fn, 'utf8') + "\n";
    }
    return result;
}
function deleteFiles(input) {
    for(let fn of input){
        fs.unlinkSync(fn);
    }
}
function deleteFile(file) {
    if(!fs.existsSync(file)){
        return;
    }
    if(fs.lstatSync(file).isDirectory()){
        for(let sub of fs.readdirSync(file)){
            deleteFile(file + '/' + sub);
        }
        fs.rmdirSync(file);
    }else{
        fs.unlinkSync(file);
    }
}
function findLuaFiles(file, files = []){
    if(!fs.existsSync(file)){
        return files;
    }
    if(fs.lstatSync(file).isDirectory()){
        for(let sub of fs.readdirSync(file)){
            files = findLuaFiles(file + '/' + sub, files);
        }
    }else{
        if(file.endsWith('.lua')){
            files.push(file);
        }
    }
    return files;
}
function combineSubModule(moduleFolder){
    let isLib = true;
    let moduleFiles = findLuaFiles(moduleFolder).filter(value => {
        if(value === moduleFolder + '/init.lua'){
            isLib = false;
            return false;
        }
        return true;
    });
    if(!isLib){
        moduleFiles.push(moduleFolder + '/init.lua');
    }
    let result = combineFiles(moduleFiles);
    deleteFiles(moduleFiles);
    return result;
}
function combineSub(sourceFolder){
    let result = {};
    if(!fs.existsSync(sourceFolder)){
        return result;
    }
    if(fs.existsSync(sourceFolder + '/client')){
        result['client'] = combineSubModule(sourceFolder + '/client');
    }
    if(fs.existsSync(sourceFolder + '/server')){
        result['server'] = combineSubModule(sourceFolder + '/server');
    }
    if(fs.existsSync(sourceFolder + '/common')){
        result['common'] = combineSubModule(sourceFolder + '/common');
    }
    return result;
}
function combineBuild(subs, targetFolder){
    if(!fs.existsSync(targetFolder)){
        fs.mkdirSync(targetFolder);
    }
    let results = {client: '', server: '', common: ''};
    for(let sub of subs){
        let subResult = combineSub(sub);
        for(let module of Object.keys(results)){
            if(subResult.hasOwnProperty(module)){
                results[module] += subResult[module] + "\n";
            }
        }
    }
    //Minimize the code
    for(let module of Object.keys(results)){
        results[module] = minimize(results[module]);
    }
    if(!fs.existsSync(targetFolder + '/client')){
        fs.mkdirSync(targetFolder + '/client');
    }
    if(!fs.existsSync(targetFolder + '/server')){
        fs.mkdirSync(targetFolder + '/server');
    }
    fs.writeFileSync(targetFolder + '/client/client.lua', results.common + results.client, 'utf8');
    fs.writeFileSync(targetFolder + '/server/server.lua', results.common + results.server, 'utf8');
}
if(!fs.existsSync('tsconfig.json')){
    fs.copyFileSync('node_modules/@onfire-network/onset-typescript-builder/config/tsconfig.json', 'tsconfig.json');
}
build(() => {
    let subs = ['node_modules/@onfire-network/onset-typescript-api/onset'];
    if(fs.existsSync('node_modules')){
        let users = [];
        for(let fn of fs.readdirSync('node_modules')){
            if(fn.startsWith("@")){
                for(let fn2 of fs.readdirSync('node_modules/'+fn)){
                    if(fn2!=="onset-typescript-api"){
                        if(fs.existsSync('node_modules/'+fn+'/'+fn2+'/onset')){
                            subs.push('node_modules/'+fn+'/'+fn2+'/onset');
                        }
                    }
                }
                continue;
            }
            if(fs.existsSync('node_modules/'+fn+'/onset')){
                subs.push('node_modules/'+fn+'/onset');
            }
        }
        for(let fn of buildConfig.libs){
            if(fs.existsSync(fn+'/onset')){
                subs.push(fn+'/onset');
            }
        }
    }
    subs.push('src');
    combineBuild(subs, 'target');
});

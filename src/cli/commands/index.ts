 import {Command } from "commander";

 const program = new Command();

 program
 .name('cpa')
 .description("Evidence-first PR regression analysis")
.version('"0.1.0')

program
.command('analyze')
.description('Analyze a GitHub Pull Request')
.requiredOption("--pr <number> ", "Pull Request numbe")
.action(async(option: {pr : string}) => {
    const prNumber = Number.parseInt(option.pr, 10)
    if(!Number.isInteger(prNumber) || prNumber <= 0 ) {
         console.error("Pr number must be a postive integer")
         process.exitCode = 1;
         return;
    }
    console.log(`Analyzing the PR # ${prNumber}`);
})

await program.parseAsync();
// --- LOADING MODULES
var express = require('express');
var body_parser = require('body-parser');

// --- INSTANTIATE THE APP
var app = express();

// Configure body-parser for express
app.use(body_parser.urlencoded({extended:false}));
app.use(body_parser.json());

// --- STATIC MIDDLEWARE 
app.use(express.static(__dirname + '/public'));
app.use('/jspsych', express.static(__dirname + "/jspsych"));

// --- VIEW LOCATION, SET UP SERVING STATIC HTML
app.set('views', __dirname + '/public/views');
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// app.disable('view cache');

// --- ROUTING
// Home page
app.get('/', function(request, response) {
    response.render('index.html');
});

// JND Experiment (Scatter)
app.get('/jnd_scatter', function(request, response) {
    response.render('jnd/jnd_experiment.html', {range: 'foundational', condition: 'base', graph_type: 'scatter'});
});

// JND Experiment (Scatter: Distractor Rainbow)
app.get('/jnd_scatter_distractor_rainbow', function(request, response) {
    response.render('jnd/jnd_experiment.html', {range: 'design', condition: 'distractor_rainbow', graph_type: 'scatter'});
});

// JND Experiment (Strip)
app.get('/jnd_strip', function(request, response) {
    response.render('jnd/jnd_experiment.html', {range: 'foundational', condition: 'base', graph_type: 'strip'});
});

// JND Trial Display
app.get('/jnd_trial', function(request, response) {
    response.render('jnd/jnd_trial_display.html');
});

// Stevens Experiment (Scatter)
app.get('/stevens_scatter', function(request, response) {
    response.render('stevens/stevens_experiment.html', {range: 'foundational', condition: 'base', graph_type: 'scatter'});
});

// Stevens Experiment (Strip)
app.get('/stevens_strip', function(request, response) {
    response.render('stevens/stevens_experiment.html', {range: 'foundational', condition: 'base', graph_type: 'strip'});
});


// Stevens Trial Display
app.get('/stevens_trial', function(request, response) {
    response.render('stevens/stevens_trial_display.html');
});

// --- START THE SERVER 
var server = app.listen(8080, function(){
    console.log("Listening on port %d", server.address().port);
});

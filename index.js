const express = require('express');
const app = express();
require('dotenv').config()
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.PAYMENT_TOKEN)
const port = process.env.PORT || 5000;

// middleware
app.use(cors())
app.use(express.json())

const verifyJWT = (req, res, next) =>{
    const authorization = req.headers.authorization;
    if(!authorization){
        return res.status(401).send({error:true, message:'unauthorized access'})
    }

    const token = authorization.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_KEY, (err, decoded)=>{
        if(err){
            return res.status(401).send({error:true, message:'unauthorized access'})
        }
        req.decoded = decoded;
        next()
    })
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nucgrat.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const menuCollection = client.db('bistroDB').collection('menu')
        const reviewCollection = client.db('bistroDB').collection('reviews')
        const cartCollection = client.db('bistroDB').collection('carts')
        const usersCollection = client.db('bistroDB').collection('users')

        // WARNING: use VerifyJWT before using verifyAdmin
        const verifyAdmin = async(req, res, next) =>{
            const email = req.decoded.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query)
            if(user?.role !== 'admin'){
                return res.status(403).send({error:true, message:'Forbidden Access'})
            }
            next()
        }

        app.post('/jwt', (req, res)=>{
            const user = req.body;
            const token = jwt.sign(user, process.env. ACCESS_KEY, {expiresIn:'1h'})
            res.send({token})
        })

        // Users related apis
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }

            const loggedUser = await usersCollection.findOne(query)
            console.log(loggedUser);
            if (loggedUser) {
                return res.send({ message: 'Already Exits' })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        // users admin apis
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            }
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.get('/users/admin/:email', verifyJWT, async(req, res)=>{
            const email = req.params.email;

            if(req.decoded.email !== email){
                return res.send({admin: false })
            }

            const query = { email: email}
            const user = await usersCollection.findOne(query)
            const result = {admin: user?.role === 'admin'}
            res.send(result)
        })

        app.delete('/users/:id', async(req, res)=>{
            const id = req.params.id
            const query = {_id: new ObjectId(id)}
            const result = await usersCollection.deleteOne(query)
            res.send(result)

        })

        // Menu related apis
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray()
            res.send(result)
        })

        app.post('/menu', verifyJWT, verifyAdmin, async(req, res)=>{
            const newItem = req.body;
            const result = await menuCollection.insertOne(newItem)
            res.send(result)
        })

        app.delete('/menu/:id', verifyJWT, verifyAdmin, async(req, res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await menuCollection.deleteOne(query)
            res.send(result)
        })


        // Reviews related apis
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray()
            res.send(result)
        })


        // Carts related apis
        app.get('/carts',verifyJWT, async (req, res) => {
            const email = req.query.email
            if(!email){
                res.send([])
            }

            const decodedEmail = req.decoded.email
            if(email !== decodedEmail){
                return res.status(403).send({error:true, message:'Forbidden Access'})
            }
            const query = { email: email }
            const result = await cartCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/carts', async (req, res) => {
            const cart = req.body;
            const result = await cartCollection.insertOne(cart)
            res.send(result)
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query)
            res.send(result)
        })


        app.post('/create-payment-intent', verifyJWT, async(req, res)=>{
            const {price} = req.body;
            const amount = parseFloat((price*100).toFixed());
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency:'usd',
                payment_method_types:['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Boss is Running')
})

app.listen(port, () => {
    console.log(`Bistro Boss is running on port: ${port}`)
})